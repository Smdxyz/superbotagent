// /modules/downloaders/play.js (REWRITTEN with single search API and job-based downloader)

import { BOT_PREFIX } from '../../config.js';
import axios from 'axios';
import he from 'he'; // Untuk mendekode entitas HTML pada judul
import { formatBytes } from '../../core/handler.js';

// Helper function untuk membuat jeda
const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Mencari video di YouTube menggunakan satu API endpoint.
 * @param {string} query Judul lagu yang dicari.
 * @returns {Promise<Array|null>} Array berisi hasil pencarian atau null jika gagal.
 */
async function searchYouTube(query) {
    const searchUrl = `https://szyrineapi.biz.id/api/youtube/search?q=${encodeURIComponent(query)}`;
    try {
        console.log(`[PLAY SEARCH] Mencari lagu: "${query}"`);
        const response = await axios.get(searchUrl, { timeout: 20000 });

        if (response.data?.status === 200 && Array.isArray(response.data.result) && response.data.result.length > 0) {
            console.log("[PLAY SEARCH] Pencarian berhasil.");
            // Ambil 5 hasil teratas dan format sesuai kebutuhan
            return response.data.result.slice(0, 5).map(v => ({
                title: he.decode(v.title || 'Judul Tidak Diketahui'),
                channel: v.channel || 'Channel Tidak Diketahui',
                url: v.url // URL lengkap ke video YouTube
            }));
        }
        console.warn("[PLAY SEARCH] Pencarian tidak menghasilkan apa-apa.");
        return null;
    } catch (error) {
        console.error(`[PLAY SEARCH] Gagal mencari lagu "${query}":`, error.message);
        throw new Error(`Gagal menghubungi server pencarian: ${error.message}`);
    }
}

/**
 * Menangani seluruh proses unduhan audio berbasis Job API dan mengirimkannya ke pengguna.
 * @param {object} sock Instance Baileys socket.
 * @param {object} msg Objek pesan dari Baileys.
 * @param {string} youtubeUrl URL video YouTube yang akan diunduh.
 */
async function downloadAndSendAudio(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;

    // Kirim pesan progres awal dan simpan key-nya untuk diedit nanti
    const progressMessage = await sock.sendMessage(sender, { text: `Oke, siap! Lagu lagi diproses ya... 🚀` }, { quoted: msg });
    const progressKey = progressMessage.key;
    const editMsg = (text) => sock.sendMessage(sender, { text: text, edit: progressKey });

    try {
        // --- Langkah 1: Memulai pekerjaan unduhan ---
        await editMsg(`⏳ Memulai permintaan unduh ke server...`);
        const initialApiUrl = `https://szyrineapi.biz.id/api/youtube/download/mp3?url=${encodeURIComponent(youtubeUrl)}`;
        const initialResponse = await axios.get(initialApiUrl, { timeout: 30000 });

        if (initialResponse.data.status !== 202 || !initialResponse.data.result.jobId) {
            throw new Error('Server gagal menerima permintaan unduh. Coba lagi nanti.');
        }

        const { jobId, statusCheckUrl } = initialResponse.data.result;
        await editMsg(`⏳ Pekerjaan diterima (ID: ${jobId.substring(0, 8)}...). Menunggu server memproses...`);

        // --- Langkah 2: Memeriksa status pekerjaan secara berkala (polling) ---
        let finalResult = null;
        const maxRetries = 30; // 30 percobaan * 4 detik = 120 detik (2 menit) timeout
        const retryDelay = 4000; // 4 detik

        for (let i = 0; i < maxRetries; i++) {
            const statusResponse = await axios.get(statusCheckUrl, { timeout: 15000 });
            const jobStatus = statusResponse.data;

            if (jobStatus.result?.status === 'completed') {
                finalResult = jobStatus.result;
                break;
            } else if (jobStatus.result?.status === 'failed') {
                throw new Error('Proses di server gagal. Mungkin video dilindungi hak cipta atau terlalu panjang.');
            }
            
            await delay(retryDelay); // Tunggu sebelum polling berikutnya
        }

        if (!finalResult) {
            throw new Error('Waktu tunggu habis, server tidak merespon atau butuh waktu lebih lama.');
        }

        // --- Langkah 3: Mengurai hasil akhir ---
        const resultData = finalResult.result;
        const downloadLink = resultData.url || resultData.link;
        const title = resultData.title || 'Audio dari YouTube';

        if (!downloadLink) {
            throw new Error('Gagal mendapatkan link unduhan final dari server.');
        }
        
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '') || 'youtube-audio';

        // --- Langkah 4: Mengirim audio ---
        try { // Percobaan 1: Kirim via stream URL langsung
            await editMsg(`✅ Link didapat. Mencoba kirim audio via stream...`);
            await sock.sendMessage(sender, {
                audio: { url: downloadLink },
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`,
            }, { quoted: msg });
            await editMsg(`✅ *Download Selesai!*\n\n*Judul:* ${title}`);
            return;
        } catch (streamError) {
            console.warn(`[PLAY] Gagal kirim via URL, mencoba metode backup...`, streamError.message);
            await editMsg(`⚠️ Stream gagal. Mencoba download manual...`);

            // Percobaan 2: Unduh ke buffer dan kirim (backup)
            const response = await axios.get(downloadLink, { 
                responseType: 'arraybuffer', 
                timeout: 300000 // Timeout 5 menit untuk unduhan
            });
            const audioBuffer = response.data;
            const fileSize = audioBuffer.length;
            
            if (fileSize < 10240) { // Cek jika file rusak/terlalu kecil
                throw new Error(`Hasil unduhan terlalu kecil atau rusak.`);
            }

            await sock.sendMessage(sender, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`
            }, { quoted: msg });
            
            await editMsg(`✅ *Download Selesai!*\n\n*Judul:* ${title}\n*Ukuran File:* ${formatBytes(fileSize)}`);
        }

    } catch (error) {
        console.error(`[PLAY DOWNLOAD] Proses gagal total:`, error);
        const errorMessage = error.response?.data?.result?.message || error.response?.data?.message || error.message;
        await editMsg(`❌ Aduh, gagal:\n${errorMessage}`);
    }
}

/**
 * Menangani event ketika pengguna memilih lagu dari daftar hasil pencarian.
 */
async function handleSongSelection(sock, msg, selectedId) {
    // ID yang dipilih memiliki format: `play_dl_${song.url}`
    const youtubeUrl = selectedId.replace('play_dl_', ''); 
    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/;

    if (!ytRegex.test(youtubeUrl)) {
         return sock.sendMessage(msg.key.remoteJid, { text: "Link YouTube yang dipilih sepertinya tidak valid." }, { quoted: msg });
    }
    
    // Panggil fungsi unduh utama, yang sudah menangani pesan progresnya sendiri
    await downloadAndSendAudio(sock, msg, youtubeUrl);
}

// --- Fungsi utama yang diekspor ---
export default async (sock, msg, args, text, sender, extras) => {
    if (!text) {
        return sock.sendMessage(sender, { text: `Mau cari lagu apa?\nContoh: *${BOT_PREFIX}play Laskar Pelangi*` }, { quoted: msg });
    }
    let sentMsg;
    try {
        sentMsg = await sock.sendMessage(sender, { text: `Oke, gass! Lagi nyari lagu *"${text}"*... 🕵️‍♂️` }, { quoted: msg });
        const results = await searchYouTube(text);

        if (!results || results.length === 0) {
            return sock.sendMessage(sender, { text: `Yah, lagunya gak ketemu 😥. Coba pake judul lain.`, edit: sentMsg.key });
        }

        const songRows = results.map((song) => ({
            title: song.title,
            description: `Channel: ${song.channel}`,
            rowId: `play_dl_${song.url}` // Prefix `play_dl_` untuk identifikasi
        }));

        const listMessage = {
            text: "Nih, dapet beberapa hasil. Pilih salah satu ya.",
            title: "🎶 Hasil Pencarian Lagu 🎶",
            buttonText: "KLIK BUAT MILIH",
            sections: [{ title: "Pilih Lagu Dari Daftar:", rows: songRows }]
        };

        await sock.sendMessage(sender, listMessage);
        await sock.sendMessage(sender, { delete: sentMsg.key }); // Hapus pesan "mencari..."
        
        // Atur handler untuk menangani pilihan pengguna dari daftar
        if (extras && typeof extras.set === 'function') {
             await extras.set(sender, 'play', handleSongSelection);
        } else {
             console.error("Peringatan: 'extras.set' tidak tersedia. Pilihan lagu tidak akan berfungsi.");
        }
    } catch (err) {
        console.error('[ERROR PLAY SEARCH]', err);
         const errorMessage = `❌ Gagal mencari: ${err.message}`;
         try {
              await sock.sendMessage(sender, { text: errorMessage, edit: sentMsg.key });
         } catch (editError) {
              await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
         }
    }
};

// --- Metadata ---
export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari YouTube sebagai MP3.';
export const usage = `${BOT_PREFIX}play <judul lagu>`;
export const requiredTier = 'Basic';
export const energyCost = 10;
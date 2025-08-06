// /modules/downloaders/play.js (FINAL & FULL CODE)

import { BOT_PREFIX } from '../../config.js';
import { formatBytes, sleep } from '../../libs/utils.js'; // Menggunakan utils.js yang baru
import axios from 'axios';
import he from 'he';

/**
 * Mencari video di YouTube.
 */
async function searchYouTube(query) {
    const searchUrl = `https://szyrineapi.biz.id/api/youtube/search?q=${encodeURIComponent(query)}`;
    try {
        const response = await axios.get(searchUrl, { timeout: 20000 });
        if (response.data?.status === 200 && Array.isArray(response.data.result) && response.data.result.length > 0) {
            return response.data.result.slice(0, 5).map(v => ({
                title: he.decode(v.title || 'Judul Tidak Diketahui'),
                channel: v.channel || 'Channel Tidak Diketahui',
                url: v.url
            }));
        }
        return null;
    } catch (error) {
        console.error(`[PLAY SEARCH] Gagal mencari lagu "${query}":`, error.message);
        throw new Error(`Gagal menghubungi server pencarian.`);
    }
}

/**
 * Menangani proses unduhan dan pengiriman audio.
 */
async function downloadAndSendAudio(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const progressMessage = await sock.sendMessage(sender, { text: `Oke, siap! Lagunya lagi diproses ya... 🚀` }, { quoted: msg });
    const progressKey = progressMessage.key;
    const editMsg = (text) => sock.sendMessage(sender, { text: text, edit: progressKey });

    try {
        await editMsg(`⏳ Memulai permintaan unduh ke server...`);
        const initialApiUrl = `https://szyrineapi.biz.id/api/youtube/download/mp3?url=${encodeURIComponent(youtubeUrl)}`;
        const initialResponse = await axios.get(initialApiUrl, { timeout: 30000 });

        if (initialResponse.data.status !== 202 || !initialResponse.data.result.jobId) {
            throw new Error('Server gagal menerima permintaan unduh.');
        }

        const { jobId, statusCheckUrl } = initialResponse.data.result;
        await editMsg(`⏳ Pekerjaan diterima. Menunggu server memproses...`);

        let finalResult = null;
        const maxRetries = 30;
        const retryDelay = 4000;

        for (let i = 0; i < maxRetries; i++) {
            const statusResponse = await axios.get(statusCheckUrl, { timeout: 15000 });
            if (statusResponse.data.result?.status === 'completed') {
                finalResult = statusResponse.data.result;
                break;
            } else if (statusResponse.data.result?.status === 'failed') {
                throw new Error('Proses di server gagal. Mungkin video dilindungi hak cipta.');
            }
            await sleep(retryDelay); // Menggunakan sleep dari utils.js
        }

        if (!finalResult) throw new Error('Waktu tunggu habis, server butuh waktu lebih lama.');

        const resultData = finalResult.result;
        const downloadLink = resultData.url || resultData.link;
        const title = resultData.title || 'Audio dari YouTube';

        if (!downloadLink) throw new Error('Gagal mendapatkan link unduhan final.');

        const cleanTitle = title.replace(/[^\w\s.-]/gi, '') || 'youtube-audio';

        try {
            await editMsg(`✅ Link didapat. Mencoba kirim audio via stream...`);
            await sock.sendMessage(sender, { audio: { url: downloadLink }, mimetype: 'audio/mpeg', fileName: `${cleanTitle}.mp3` }, { quoted: msg });
            await editMsg(`✅ *Download Selesai!*\n\n*Judul:* ${title}`);
        } catch (streamError) {
            await editMsg(`⚠️ Stream gagal. Mencoba download manual...`);
            const response = await axios.get(downloadLink, { responseType: 'arraybuffer', timeout: 300000 });
            const audioBuffer = response.data;
            if (audioBuffer.length < 10240) throw new Error(`Hasil unduhan rusak.`);
            await sock.sendMessage(sender, { audio: audioBuffer, mimetype: 'audio/mpeg', fileName: `${cleanTitle}.mp3` }, { quoted: msg });
            await editMsg(`✅ *Download Selesai!*\n\n*Judul:* ${title}\n*Ukuran File:* ${formatBytes(audioBuffer.length)}`);
        }
    } catch (error) {
        await editMsg(`❌ Aduh, gagal:\n${error.message}`);
    }
}

/**
 * Menangani event saat pengguna memilih lagu dari daftar.
 */
async function handleSongSelection(sock, msg, selectedId) {
    const youtubeUrl = selectedId.replace('play_dl_', '');
    if (!/^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/.test(youtubeUrl)) {
         return sock.sendMessage(msg.key.remoteJid, { text: "Link YouTube yang dipilih tidak valid." }, { quoted: msg });
    }
    await downloadAndSendAudio(sock, msg, youtubeUrl);
}

// Fungsi eksekusi utama
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
            rowId: `play_dl_${song.url}`
        }));

        const listMessage = {
            text: "Nih, dapet beberapa hasil. Pilih salah satu ya.",
            title: "🎶 Hasil Pencarian Lagu 🎶",
            buttonText: "KLIK BUAT MILIH",
            sections: [{ title: "Pilih Lagu Dari Daftar:", rows: songRows }]
        };

        await sock.sendMessage(sender, listMessage);
        await sock.sendMessage(sender, { delete: sentMsg.key });
        
        if (extras && typeof extras.set === 'function') {
             await extras.set(sender, 'play', handleSongSelection);
        } else {
             console.error("Peringatan: 'extras.set' tidak tersedia.");
        }
    } catch (err) {
        const errorMessage = `❌ Gagal mencari: ${err.message}`;
        try {
            await sock.sendMessage(sender, { text: errorMessage, edit: sentMsg.key });
        } catch (editError) {
            await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
        }
    }
};

// Metadata
export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari YouTube sebagai MP3.';
export const usage = `${BOT_PREFIX}play <judul lagu>`;
export const requiredTier = 'Basic';
export const energyCost = 10;
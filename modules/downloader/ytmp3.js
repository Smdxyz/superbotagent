// /modules/downloaders/ytmp3.js (FINAL & FULL CODE)

import { BOT_PREFIX } from '../../config.js';
import { formatBytes, sleep } from '../../libs/utils.js'; // Menggunakan utils.js yang baru
import axios from 'axios';

// Helper function untuk mendapatkan ID Video YouTube
function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Fungsi utama untuk memproses unduhan audio
async function processAudioDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
        return sock.sendMessage(sender, { text: `❌ Format link YouTube tidak valid.` }, { quoted: msg });
    }

    const progressMessage = await sock.sendMessage(sender, { text: `⏳ Oke, sedang memproses permintaan...` }, { quoted: msg });
    const progressKey = progressMessage.key;
    const editMsg = (text) => sock.sendMessage(sender, { text: text, edit: progressKey });

    try {
        // Langkah 1: Memulai pekerjaan unduhan di server
        await editMsg(`⏳ Memulai permintaan unduh ke server...`);
        const initialApiUrl = `https://szyrineapi.biz.id/api/youtube/download/mp3?url=${encodeURIComponent(youtubeUrl)}`;
        const initialResponse = await axios.get(initialApiUrl, { timeout: 30000 });

        if (initialResponse.data.status !== 202 || !initialResponse.data.result.jobId) {
            throw new Error('Server gagal menerima permintaan unduh. Coba lagi nanti.');
        }

        const { jobId, statusCheckUrl } = initialResponse.data.result;
        await editMsg(`⏳ Pekerjaan diterima (ID: ${jobId.substring(0, 8)}...). Menunggu server memproses...`);

        // Langkah 2: Memeriksa status pekerjaan secara berkala (polling)
        let finalResult = null;
        const maxRetries = 30; // 30 percobaan * 4 detik = 2 menit timeout
        const retryDelay = 4000; // 4 detik

        for (let i = 0; i < maxRetries; i++) {
            const statusResponse = await axios.get(statusCheckUrl, { timeout: 15000 });
            const jobStatus = statusResponse.data;

            if (jobStatus.result?.status === 'completed') {
                finalResult = jobStatus.result;
                break; // Keluar dari loop jika sudah selesai
            } else if (jobStatus.result?.status === 'failed') {
                throw new Error('Proses di server gagal. Coba lagi dengan link lain.');
            }
            
            // Menggunakan sleep dari utils.js
            await sleep(retryDelay); 
        }

        if (!finalResult) {
            throw new Error('Waktu tunggu habis, server tidak merespon atau butuh waktu lebih lama.');
        }

        // Langkah 3: Mengurai hasil akhir dan mengirim file
        const resultData = finalResult.result;
        const downloadLink = resultData.url || resultData.link;
        const title = resultData.title || 'Audio dari YouTube';

        if (!downloadLink) {
            throw new Error('Gagal mendapatkan link unduhan final dari server.');
        }
        
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '') || 'youtube-audio';

        // Percobaan 1: Kirim via stream langsung
        try {
            await editMsg(`✅ Link didapat. Mencoba kirim audio via stream...`);
            await sock.sendMessage(sender, {
                audio: { url: downloadLink },
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`,
            }, { quoted: msg });
            await editMsg(`✅ Berhasil dikirim via stream!`);
        } catch (streamError) {
            // Percobaan 2: Jika stream gagal, unduh manual (backup)
            await editMsg(`⚠️ Stream gagal. Mencoba download manual...`);
            const response = await axios.get(downloadLink, { responseType: 'arraybuffer', timeout: 300000 });
            const audioBuffer = response.data;
            const fileSize = audioBuffer.length;
            if (fileSize < 10240) throw new Error(`Hasil unduhan terlalu kecil atau rusak.`);
            
            await sock.sendMessage(sender, { audio: audioBuffer, mimetype: 'audio/mpeg', fileName: `${cleanTitle}.mp3` }, { quoted: msg });
            await editMsg(`✅ *Proses Selesai!* (Backup)\n\n*Judul:* ${title}\n*Ukuran File:* ${formatBytes(fileSize)}`);
        }

    } catch (error) {
        const errorMessage = error.response?.data?.result?.message || error.response?.data?.message || error.message;
        await editMsg(`❌ Aduh, gagal:\n${errorMessage}`);
    }
}

// Export dan metadata
export default async function execute(sock, msg, args) {
    const userUrl = args[0];
    if (!userUrl || !/^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/.test(userUrl)) {
        return sock.sendMessage(msg.key.remoteJid, { text: `Format salah.\nContoh: *${BOT_PREFIX}ytmp3 <url_youtube>*` }, { quoted: msg });
    }
    await processAudioDownload(sock, msg, userUrl);
}
export const category = 'downloaders';
export const description = 'Mengunduh audio dari link YouTube sebagai file MP3.';
export const usage = `${BOT_PREFIX}ytmp3 <url_youtube>`;
export const aliases = ['ytvn'];
export const requiredTier = 'Basic';
export const energyCost = 10;
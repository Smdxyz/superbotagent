// /modules/downloaders/ytmp3.js (REWRITTEN with new Job-based API)

import { BOT_PREFIX } from '../../config.js';
import { formatBytes } from '../../core/handler.js';
import axios from 'axios';

// Helper function to create a delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// Extracts YouTube video ID from various URL formats
function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// The main function to handle the download process
async function processAudioDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
        return sock.sendMessage(sender, { text: `❌ Format link YouTube tidak valid.` }, { quoted: msg });
    }

    // Send initial progress message and get its key to edit it later
    const progressMessage = await sock.sendMessage(sender, { text: `⏳ Oke, sedang memproses permintaan...` }, { quoted: msg });
    const progressKey = progressMessage.key;
    const editMsg = (text) => sock.sendMessage(sender, { text: text, edit: progressKey });

    try {
        // --- Step 1: Initiate the download job ---
        await editMsg(`⏳ Memulai permintaan unduh ke server...`);
        const initialApiUrl = `https://szyrineapi.biz.id/api/youtube/download/mp3?url=${encodeURIComponent(youtubeUrl)}`;
        const initialResponse = await axios.get(initialApiUrl, { timeout: 30000 });

        if (initialResponse.data.status !== 202 || !initialResponse.data.result.jobId) {
            throw new Error('Server gagal menerima permintaan unduh. Coba lagi nanti.');
        }

        const { jobId, statusCheckUrl } = initialResponse.data.result;
        await editMsg(`⏳ Pekerjaan diterima (ID: ${jobId}). Menunggu server memproses...`);

        // --- Step 2: Poll for the job status ---
        let finalResult = null;
        const maxRetries = 30; // 30 retries * 4s = 120s (2 minutes) timeout
        const retryDelay = 4000; // 4 seconds

        for (let i = 0; i < maxRetries; i++) {
            const statusResponse = await axios.get(statusCheckUrl, { timeout: 15000 });
            const jobStatus = statusResponse.data;

            if (jobStatus.result?.status === 'completed') {
                finalResult = jobStatus.result;
                break;
            } else if (jobStatus.result?.status === 'failed') {
                throw new Error('Proses di server gagal. Coba lagi dengan link lain.');
            }
            
            // Wait before the next poll
            await delay(retryDelay);
        }

        if (!finalResult) {
            throw new Error('Waktu tunggu habis, server tidak merespon atau butuh waktu lebih lama.');
        }

        // --- Step 3: Parse the final result ---
        const resultData = finalResult.result;
        const downloadLink = resultData.url || resultData.link;
        const title = resultData.title || 'Audio dari YouTube';

        if (!downloadLink) {
            throw new Error('Gagal mendapatkan link unduhan final dari server.');
        }
        
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '') || 'youtube-audio';

        // --- Step 4: Send the audio ---
        // Attempt 1: Send via direct URL stream
        try {
            await editMsg(`✅ Link didapat. Mencoba kirim audio via stream...`);
            await sock.sendMessage(sender, {
                audio: { url: downloadLink },
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`,
            }, { quoted: msg });
            await editMsg(`✅ Berhasil dikirim via stream!`);
            return;
        } catch (streamError) {
            console.warn(`[YTMP3] Gagal kirim via URL, mencoba metode backup...`, streamError.message);
            await editMsg(`⚠️ Stream gagal. Mencoba download manual...`);

            // Attempt 2: Download the file to a buffer and send
            const response = await axios.get(downloadLink, { 
                responseType: 'arraybuffer', 
                timeout: 300000 // 5 minutes timeout for download
            });
            const audioBuffer = response.data;
            const fileSize = audioBuffer.length;
            
            if (fileSize < 10240) { // Check if file is too small (likely an error page)
                throw new Error(`Hasil unduhan terlalu kecil atau rusak.`);
            }

            await sock.sendMessage(sender, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`
            }, { quoted: msg });
            
            await editMsg(`✅ *Proses Selesai!* (Download Manual)\n\n*Judul:* ${title}\n*Ukuran File:* ${formatBytes(fileSize)}`);
        }

    } catch (error) {
        console.error(`[YTMP3] Proses gagal total:`, error);
        // Cek jika error berasal dari axios dan memiliki response data
        const errorMessage = error.response?.data?.result?.message || error.response?.data?.message || error.message;
        await editMsg(`❌ Aduh, gagal:\n${errorMessage}`);
    }
}

// Export dan metadata (tetap sama)
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
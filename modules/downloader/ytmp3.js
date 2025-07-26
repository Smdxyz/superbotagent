// /modules/downloaders/ytmp3.js (FIXED URL PATHS & FFmpeg LOGIC)

import { BOT_PREFIX } from '../../config.js';
import { formatBytes } from '../../core/handler.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import fluent from 'fluent-ffmpeg';
import axios from 'axios';

const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function parseYtmp3Result(providerKey, rawData) {
    if (!rawData || rawData.status !== 200 || !rawData.result) return null;
    const res = rawData.result;
    let downloadLink = null, title = null;
    switch (providerKey) {
        case 's_dlv1':
        case 's_mp3dl':
        case 's_nu':
            title = res.title;
            downloadLink = res.url;
            break;
        case 's0': title = res.filename; downloadLink = res.link; break;
        case 's_flvto': title = res.title; downloadLink = res.url; break;
        case 's1': title = res.title; downloadLink = res.url; break;
        case 's_notube': title = res.title; downloadLink = res.download_url; break;
        default: return null;
    }
    if (downloadLink) return { url: downloadLink, title: title || 'Audio dari YouTube' };
    return null;
}

// [FIX] URL path diperbaiki & requiresFFmpeg dikembalikan ke logika awal
const API_PROVIDERS = [
    // Endpoint baru dengan path /api/youtube/ (tidak butuh ffmpeg)
    { name: 'Server Download (v1)', key: 's_dlv1', url: 'https://szyrineapi.biz.id/api/youtube/dl/v1', requiresFFmpeg: false },
    { name: 'Server Utama (mp3dl)', key: 's_mp3dl', url: 'https://szyrineapi.biz.id/api/youtube/mp3/mp3dl', requiresFFmpeg: false },
    { name: 'Server Alternatif (nu)', key: 's_nu', url: 'https://szyrineapi.biz.id/api/youtube/mp3/nu', requiresFFmpeg: false },
    // Endpoint lama dengan path /api/downloaders/yt/
    { name: 'Server Cepat (Scrape)', key: 's0', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-scrape', requiresFFmpeg: false },
    { name: 'Server Stabil (FLVTO)', key: 's_flvto', url: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto', requiresFFmpeg: false },
    { name: 'Server v1 (Lama)', key: 's1', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v1', requiresFFmpeg: false },
    { name: 'Server Cadangan (Notube)', key: 's_notube', url: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/notube', requiresFFmpeg: true },
];

async function processAudioDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) return sock.sendMessage(sender, { text: `❌ Format link YouTube tidak valid.` }, { quoted: msg });

    const progressMessage = await sock.sendMessage(sender, { text: `⏳ Oke, sedang memproses permintaan...` }, { quoted: msg });
    const progressKey = progressMessage.key;
    const editMsg = (text) => sock.sendMessage(sender, { text: text, edit: progressKey });
    
    let downloadInfo = null, chosenProvider = null, tempFilePath = '';

    try {
        for (const provider of API_PROVIDERS) {
            try {
                await editMsg(`🎲 Mencoba server: *${provider.name}*...`);
                let apiUrl = (provider.key === 's_notube')
                    ? `${provider.url}?id=${videoId}&format=mp3`
                    : `${provider.url}?url=${encodeURIComponent(youtubeUrl)}`;
                const apiResponse = await axios.get(apiUrl, { timeout: 120000 });
                const parsedInfo = parseYtmp3Result(provider.key, apiResponse.data);
                if (parsedInfo && parsedInfo.url) {
                    downloadInfo = parsedInfo;
                    chosenProvider = provider;
                    break;
                }
            } catch (apiError) {
                console.error(`[YTMP3] Error dari provider ${provider.name}:`, apiError.message);
            }
        }
        if (!downloadInfo || !chosenProvider) throw new Error("Gagal mendapatkan link setelah mencoba semua server.");

        const cleanTitle = downloadInfo.title.replace(/[^\w\s.-]/gi, '') || 'youtube-audio';

        if (!chosenProvider.requiresFFmpeg) {
            try {
                await editMsg(`✅ Link didapat. Mencoba kirim audio via stream langsung...`);
                await sock.sendMessage(sender, {
                    audio: { url: downloadInfo.url },
                    mimetype: 'audio/mpeg',
                    fileName: `${cleanTitle}.mp3`,
                }, { quoted: msg });
                await editMsg(`✅ Berhasil dikirim via stream!`);
                return;
            } catch (streamError) {
                console.warn(`[YTMP3] Gagal kirim via URL, mencoba metode backup...`, streamError.message);
                await editMsg(`⚠️ Stream gagal. Mencoba download manual...`);
                const response = await axios.get(downloadInfo.url, { responseType: 'arraybuffer', timeout: 300000 });
                const audioBuffer = response.data;
                const fileSize = audioBuffer.length;
                if (fileSize < 10240) throw new Error(`Hasil unduhan terlalu kecil atau rusak.`);
                await sock.sendMessage(sender, { audio: audioBuffer, mimetype: 'audio/mpeg', fileName: `${cleanTitle}.mp3` }, { quoted: msg });
                await editMsg(`✅ *Proses Selesai!* (Backup)\n\n*Judul:* ${downloadInfo.title}\n*Ukuran File:* ${formatBytes(fileSize)}`);
            }
        } else {
            await editMsg(`📥 Mengunduh & butuh konversi via FFmpeg...`);
            tempFilePath = path.join(tempDir, `${Date.now()}_${cleanTitle}.mp3`);
            const response = await axios({ method: 'GET', url: downloadInfo.url, responseType: 'stream', timeout: 300000 });
            await new Promise((resolve, reject) => {
                fluent(response.data).audioCodec('libmp3lame').audioBitrate('128k').format('mp3')
                    .on('error', (err) => reject(new Error(`FFmpeg gagal: ${err.message}`)))
                    .on('end', resolve)
                    .save(tempFilePath);
            });
            const stats = await fsPromises.stat(tempFilePath);
            if (stats.size < 10240) throw new Error(`Hasil konversi FFmpeg terlalu kecil.`);
            await sock.sendMessage(sender, { audio: await fsPromises.readFile(tempFilePath), mimetype: 'audio/mpeg', fileName: `${cleanTitle}.mp3` }, { quoted: msg });
            await editMsg(`✅ *Proses Selesai!* (FFmpeg)\n\n*Judul:* ${downloadInfo.title}\n*Ukuran File:* ${formatBytes(stats.size)}`);
        }
    } catch (error) {
        console.error(`[YTMP3] Proses gagal total:`, error);
        await editMsg(`❌ Aduh, gagal:\n${error.message}`);
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            await fsPromises.unlink(tempFilePath).catch(e => console.error("Gagal hapus file temp:", e));
        }
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
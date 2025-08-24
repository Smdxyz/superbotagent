// /modules/downloaders/tiktok.js (UPGRADED WITH NEW 'tiktok-vid' API)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import axios from 'axios';

export const category = 'downloaders';
export const description = 'Mengunduh video atau audio dari tautan TikTok.';
export const usage = `${BOT_PREFIX}tiktok <url_tiktok>`;
export const aliases = ['tt', 'ttdl'];
export const energyCost = 5;

// Handler untuk menangani pilihan format dari pengguna
async function handleFormatSelection(sock, msg, body, context) {
    const sender = msg.key.remoteJid;
    const { hd, sd, mp3, caption } = context;

    let urlToDownload, format, handlerFn;

    switch (body) {
        case 'tt_dl_hd':
            urlToDownload = hd;
            format = 'Video HD';
            handlerFn = async (buffer) => sock.sendMessage(sender, { video: buffer, caption }, { quoted: msg });
            break;
        case 'tt_dl_sd':
            urlToDownload = sd;
            format = 'Video SD';
            handlerFn = async (buffer) => sock.sendMessage(sender, { video: buffer, caption }, { quoted: msg });
            break;
        case 'tt_dl_mp3':
            urlToDownload = mp3;
            format = 'Audio MP3';
            handlerFn = async (buffer) => sock.sendMessage(sender, { audio: buffer, mimetype: 'audio/mpeg', fileName: `Audio TikTok.mp3` }, { quoted: msg });
            break;
        default:
            return; // Abaikan jika input tidak valid
    }

    const statusMsg = await sock.sendMessage(sender, { text: `✅ Oke, Aira download file format *${format}*. Sabar ya...` }, { quoted: msg });

    try {
        if (!urlToDownload) {
            throw new Error(`Link untuk format ${format} tidak tersedia.`);
        }
        // Download langsung tanpa header khusus
        const response = await axios.get(urlToDownload, { responseType: 'arraybuffer', timeout: 90000 });
        const fileBuffer = response.data;

        if (!fileBuffer || fileBuffer.length < 10000) {
            throw new Error("File yang diunduh rusak atau terlalu kecil.");
        }

        await sock.sendMessage(sender, { text: `🚀 Berhasil! Mengirim file...`, edit: statusMsg.key });
        await handlerFn(fileBuffer);
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (error) {
        console.error('[TIKTOK_DOWNLOAD_ERROR]', error);
        await sock.sendMessage(sender, { text: `❌ Gagal total saat download: ${error.message}`, edit: statusMsg.key });
    }
}

// Fungsi utama untuk memulai proses download
async function startTikTokDownload(sock, msg, userUrl, extras) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: `⏳ Menganalisis link TikTok dengan API baru...` }, { quoted: msg });

    try {
        // Menggunakan endpoint API baru: /tiktok-vid
        const result = await safeApiGet(`https://szyrineapi.biz.id/api/downloaders/tiktok-vid?url=${encodeURIComponent(userUrl)}`);

        if (!result || !result.status) {
            throw new Error('Respons API tidak valid atau statusnya false.');
        }

        // Ekstrak data dari respons baru yang terstruktur
        const videos = result.data || [];
        const hdLink = videos.find(v => v.type === 'nowatermark_hd')?.url;
        const sdLink = videos.find(v => v.type === 'nowatermark')?.url;
        const mp3Link = result.music_info?.url;
        const thumbnail = result.cover;
        const title = result.title;
        const author = result.author?.nickname;
        
        const finalCaption = `*${title?.trim() || 'Video TikTok'}*\nOleh: @${author || 'Unknown'}\n\n${WATERMARK}`;

        const buttons = [];
        if (hdLink) buttons.push({ buttonId: 'tt_dl_hd', buttonText: { displayText: 'Video HD' }, type: 1 });
        if (sdLink) buttons.push({ buttonId: 'tt_dl_sd', buttonText: { displayText: 'Video SD' }, type: 1 });
        if (mp3Link) buttons.push({ buttonId: 'tt_dl_mp3', buttonText: { displayText: 'Audio (MP3)' }, type: 1 });

        if (buttons.length === 0) {
            throw new Error("API tidak memberikan link download sama sekali.");
        }

        const buttonMessage = {
            image: { url: thumbnail },
            caption: `*${title?.trim() || 'Video TikTok'}*\n\nPilih format yang mau diunduh di bawah ini.`,
            footer: `Oleh: ${author || 'Unknown'}`,
            buttons: buttons,
            headerType: 4
        };

        await sock.sendMessage(sender, { delete: statusMsg.key });
        await sock.sendMessage(sender, buttonMessage, { quoted: msg });
        
        // Set waitState dengan data yang sudah diekstrak
        await extras.set(sender, 'tiktok_format_selection', {
            handler: handleFormatSelection,
            context: { hd: hdLink, sd: sdLink, mp3: mp3Link, caption: finalCaption },
            timeout: 120000
        });

    } catch (error) {
        console.error('[TIKTOK_API_ERROR]', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal ngambil data TikTok: ${error.message}`, edit: statusMsg.key });
    }
}

// Handler untuk menunggu input URL jika tidak diberikan
async function handleUrlInput(sock, msg, body, context) {
    const url = body.trim();
    if (!url || !url.includes('tiktok.com')) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Ini sepertinya bukan link TikTok. Coba lagi.' }, { quoted: msg });
    }
    await startTikTokDownload(sock, msg, url, context.extras);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    // Mencari link di seluruh teks pesan untuk fleksibilitas
    const userUrl = text.trim().split(/\s+/).find(word => word.includes('tiktok.com'));

    if (userUrl) {
        await startTikTokDownload(sock, msg, userUrl, extras);
    } else {
        await sock.sendMessage(sender, { text: `Kirim link video TikTok yang mau di-download.` }, { quoted: msg });
        await extras.set(sender, 'tiktok_url_input', {
            handler: handleUrlInput,
            context: { extras },
            timeout: 120000
        });
    }
}
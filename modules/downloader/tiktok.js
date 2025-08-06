// /modules/downloaders/tiktok.js (FINAL & FULL CODE - WAITSTATE FIXED)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import axios from 'axios';

export const category = 'downloaders';
export const description = 'Mengunduh video atau semua gambar dari tautan TikTok.';
export const usage = `${BOT_PREFIX}tiktok <url_tiktok>`;
export const aliases = ['tt', 'ttdl'];
export const energyCost = 5;

async function downloadWithStealth(url) {
     const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://tiktokio.com/'
        }
    });
    const buffer = Buffer.from(response.data, 'binary');
    if (buffer.length < 10000) throw new Error("Server ngasih file ampas, mungkin linknya mati.");
    return buffer;
}

async function handleQualitySelection(sock, msg, body, context) {
    const sender = msg.key.remoteJid;
    const { hd, sd, mp3, caption } = context;

    let urlToDownload, quality, handlerFn;

    switch (body) {
        case 'tt_dl_hd': urlToDownload = hd; quality = 'Video HD'; handlerFn = async (b) => sock.sendMessage(sender, { video: b, caption }, { quoted: msg }); break;
        case 'tt_dl_sd': urlToDownload = sd; quality = 'Video SD'; handlerFn = async (b) => sock.sendMessage(sender, { video: b, caption }, { quoted: msg }); break;
        case 'tt_dl_mp3': urlToDownload = mp3; quality = 'Audio MP3'; handlerFn = async (b) => sock.sendMessage(sender, { audio: b, mimetype: 'audio/mpeg' }, { quoted: msg }); break;
        default: return;
    }

    const statusMsg = await sock.sendMessage(sender, { text: `✅ Oke, download file *${quality}*. Sabar ya...` }, { quoted: msg });

    try {
        if (!urlToDownload) throw new Error(`Link buat kualitas ${quality} nggak ada.`);
        const fileBuffer = await downloadWithStealth(urlToDownload);
        await sock.sendMessage(sender, { text: `🚀 Udah dapet! Ngirim file...`, edit: statusMsg.key });
        await handlerFn(fileBuffer);
        await sock.sendMessage(sender, { delete: statusMsg.key });
    } catch (error) {
        await sock.sendMessage(sender, { text: `❌ Gagal total: ${error.message}`, edit: statusMsg.key });
    }
}

async function handleVideoType(sock, msg, result, extras) {
    const sender = msg.key.remoteJid;
    const { no_watermark_hd, no_watermark, mp3 } = result.media[0].links;
    const caption = `*${result.description?.trim() || 'Video TikTok'}*\nOleh: @${result.author.unique_id || 'Unknown'}\n\n${WATERMARK}`;

    const buttons = [];
    if (no_watermark_hd) buttons.push({ buttonId: 'tt_dl_hd', buttonText: { displayText: 'Video HD' }, type: 1 });
    if (no_watermark) buttons.push({ buttonId: 'tt_dl_sd', buttonText: { displayText: 'Video SD' }, type: 1 });
    if (mp3) buttons.push({ buttonId: 'tt_dl_mp3', buttonText: { displayText: 'Audio (MP3)' }, type: 1 });

    if (buttons.length === 0) throw new Error("API tidak memberikan link download sama sekali.");

    const buttonMessage = {
        image: { url: result.media[0].thumbnail },
        caption: `*${result.description?.trim() || 'Video TikTok'}*\n\nPilih format yang mau diunduh.`,
        footer: `Oleh: ${result.author.nickname || 'Unknown'}`,
        buttons: buttons,
        headerType: 4
    };

    await sock.sendMessage(sender, buttonMessage, { quoted: msg });
    
    await extras.set(sender, 'tiktok', {
        handler: handleQualitySelection,
        context: { hd: no_watermark_hd, sd: no_watermark, mp3, caption },
        timeout: 120000
    });
}

async function handleCarouselType(sock, msg, result) {
    const sender = msg.key.remoteJid;
    const images = result.media;
    if (!images || images.length === 0) throw new Error("API bilang ini carousel, tapi isinya kosong.");

    const statusMsg = await sock.sendMessage(sender, { text: `✅ Ditemukan *${images.length}* gambar. Lagi download semua, sabar ya...`}, { quoted: msg });
    const mainCaption = `*Oleh: ${result.author.nickname?.trim() || 'Unknown'}*\n\n${result.description?.trim() || 'Slideshow TikTok'}\n\n${WATERMARK}`;
    const albumItems = [];

    for (const [index, item] of images.entries()) {
        try {
            await sock.sendMessage(sender, { text: `📥 Downloading gambar ${index + 1}/${images.length}...`, edit: statusMsg.key });
            const buffer = await downloadWithStealth(item.url);
            albumItems.push({ image: buffer, caption: index === 0 ? mainCaption : '' });
        } catch (e) {
            console.warn(`Gagal download salah satu gambar carousel: ${e.message}`);
        }
    }

    if (albumItems.length === 0){
        await sock.sendMessage(sender, { text: `❌ Gagal download semua gambar dari slideshow ini.`, edit: statusMsg.key });
        return;
    }

    await sock.sendMessage(sender, { text: `🚀 Mengirim album...`, edit: statusMsg.key });
    await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
    await sock.sendMessage(sender, { delete: statusMsg.key });
}

async function startTikTokDownload(sock, msg, userUrl, extras) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: `⏳ Menganalisis link TikTok...` }, { quoted: msg });
    try {
        const result = await safeApiGet(`https://szyrineapi.biz.id/api/downloaders/tiktok?url=${encodeURIComponent(userUrl)}`);
        if (!result || !result.type) throw new Error('Respons API tidak valid atau tipenya aneh.');
        await sock.sendMessage(sender, { delete: statusMsg.key });
        if (result.type === 'video') {
            await handleVideoType(sock, msg, result, extras);
        } else if (result.type === 'carousel') {
            await handleCarouselType(sock, msg, result);
        } else {
            throw new Error(`Tipe konten ini belum didukung: ${result.type}`);
        }
    } catch (error) {
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal ngambil data TikTok: ${error.message}`, edit: statusMsg.key });
    }
}

async function handleUrlInput(sock, msg, body, context) {
    const url = body.trim();
    if (!url || !url.includes('tiktok.com')) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Ini bukan link TikTok.' }, { quoted: msg });
    }
    await startTikTokDownload(sock, msg, url, context.extras);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args.find(arg => arg.includes('tiktok.com'));
    if (userUrl) {
        await startTikTokDownload(sock, msg, userUrl, extras);
    } else {
        await sock.sendMessage(sender, { text: `Kirim link video atau slideshow TikTok yang mau di-download.` }, { quoted: msg });
        await extras.set(sender, 'tiktok', {
            handler: handleUrlInput,
            context: { extras },
            timeout: 120000
        });
    }
}
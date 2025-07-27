// /modules/downloaders/igdl.js (Final, Sesuai Dokumentasi Baileys-Pro)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';

export const category = 'downloaders';
export const description = 'Mengunduh media (foto/video/reels) dari Instagram.';
export const usage = `${BOT_PREFIX}igdl <link_instagram>`;
export const aliases = ['ig'];
export const energyCost = 4;

const API_TIMEOUT = 60000; // 60 detik

/**
 * Mengirim media yang telah didapatkan sesuai dokumentasi @fizzxydev/baileys-pro
 * @param {object} sock - Socket Baileys.
 * @param {object} msg - Objek pesan asli.
 * @param {Array<object>} mediaList - Daftar media, format: [{ type: 'image' | 'video', url: string }].
 * @param {string} fullCaption - Caption lengkap untuk dikirim.
 */
async function sendMedia(sock, msg, mediaList, fullCaption) {
    const sender = msg.key.remoteJid;

    // KASUS 1: HANYA ADA SATU MEDIA (FOTO ATAU VIDEO)
    // Sesuai dokumentasi, kirim menggunakan sock.sendMessage biasa.
    if (mediaList.length === 1) {
        const media = mediaList[0];
        console.log(`[IGDL] Mengirim media tunggal tipe: ${media.type}`);
        // [media.type] akan menjadi 'image' atau 'video', membentuk objek yang valid
        // contoh: { image: { url: '...' }, caption: '...' }
        await sock.sendMessage(sender, { [media.type]: { url: media.url }, caption: fullCaption }, { quoted: msg });
        return;
    }

    // KASUS 2: ADA LEBIH DARI SATU MEDIA
    // Sesuai dokumentasi, kirim sebagai album (carousel).
    if (mediaList.length > 1) {
        console.log(`[IGDL] Mengirim album berisi ${mediaList.length} media.`);
        // Membuat array objek yang sesuai dengan format album di dokumentasi.
        const albumItems = mediaList.map((item, index) => {
            // Mengembalikan objek dengan kunci 'image' atau 'video' secara eksplisit.
            const mediaObject = { [item.type]: { url: item.url } };
            // Tambahkan caption hanya pada item pertama untuk menghindari duplikasi.
            if (index === 0) {
                mediaObject.caption = fullCaption;
            }
            return mediaObject;
        });

        // Panggil fungsi untuk mengirim album.
        // Nama fungsi ini bisa bervariasi (misal: sendCarouselMessage), tapi `sendAlbumMessage` umum digunakan.
        await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
    }
}

async function startInstagramDownload(sock, msg, instagramUrl) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Menganalisis link Instagram...' }, { quoted: msg });

    try {
        const apiUrl = `https://szyrineapi.biz.id/api/downloaders/itt?platform=instagram&url=${encodeURIComponent(instagramUrl)}`;
        const response = await axios.get(apiUrl, { timeout: API_TIMEOUT });
        const data = response.data;

        if (response.status !== 200 || !data.result?.download || data.result.download.length === 0) {
            throw new Error('API utama (/itt) tidak mengembalikan media.');
        }

        const mediaUrls = data.result.download;
        const mediaList = mediaUrls.map(url => ({
            type: url.includes('.mp4') ? 'video' : 'image', // Tipe: 'image' atau 'video'
            url: url
        }));
        
        const fullCaption = `*Download Berhasil!* ✨\n\n${WATERMARK}`.trim();
        await sock.sendMessage(sender, { text: `✅ Oke, dapet *${mediaList.length}* media! Ngirim sekarang...`, edit: statusMsg.key });
        await sendMedia(sock, msg, mediaList, fullCaption);
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (primaryError) {
        console.error('[IGDL Primary Error]', primaryError.message);
        await sock.sendMessage(sender, { text: '⏳ Gagal dengan API utama. Mencoba API cadangan...', edit: statusMsg.key });

        try {
            const fallbackApiUrl = `https://szyrineapi.biz.id/api/downloaders/ig?url=${encodeURIComponent(instagramUrl)}`;
            const fallbackResponse = await axios.get(fallbackApiUrl, { timeout: API_TIMEOUT });
            const fallbackData = fallbackResponse.data;

            if (fallbackResponse.status !== 200 || !fallbackData.result?.media || fallbackData.result.media.length === 0) {
                throw new Error('API cadangan (/ig) juga gagal.');
            }

            const mediaList = fallbackData.result.media.map(item => ({
                type: item.tipe === 'foto' ? 'image' : 'video', // Konversi 'foto' -> 'image'
                url: item.url
            }));

            const { caption } = fallbackData.result;
            const username = fallbackData.result.akun?.username;
            const fullCaption = `*Username:* @${username || 'N/A'}\n\n${caption || 'Tanpa caption.'}\n\n${WATERMARK}`.trim();
            
            await sock.sendMessage(sender, { text: `✅ Oke, dapat *${mediaList.length}* media dari API cadangan! Mengirim...`, edit: statusMsg.key });
            await sendMedia(sock, msg, mediaList, fullCaption);
            await sock.sendMessage(sender, { delete: statusMsg.key });

        } catch (fallbackError) {
            console.error('[IGDL Fallback Error]', fallbackError.message);
            await sock.sendMessage(sender, { text: `❌ Gagal total: ${fallbackError.message}`, edit: statusMsg.key });
        }
    }
}


async function handleUrlInput(sock, msg, body, waitState) {
    const url = body.trim();
    const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[\w-]+/;
    if (!url || !instagramRegex.test(url)) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Link yang Anda kirim sepertinya bukan link post atau reel Instagram yang valid. Silakan coba lagi.' }, { quoted: msg });
    }
    await startInstagramDownload(sock, msg, url);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args[0];
    if (userUrl) {
        await startInstagramDownload(sock, msg, userUrl);
    } else {
        await sock.sendMessage(sender, { text: 'Silakan kirim link post atau reel Instagram yang ingin Anda unduh.' }, { quoted: msg });
        await extras.set(sender, handleUrlInput, 120000, { originalMsgKey: msg.key });
    }
}
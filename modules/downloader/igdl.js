// /modules/downloaders/igdl.js (REWRITTEN: Prioritas API baru & Bahasa Gaul)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';

export const category = 'downloaders';
export const description = 'Download foto/video/reels dari Instagram.';
export const usage = `${BOT_PREFIX}igdl <link_instagram>`;
export const aliases = ['ig'];
export const energyCost = 4;

const API_TIMEOUT = 60000; // 60 detik

/**
 * Mengirim media yang sudah didapat.
 * Fungsi ini menangani pengiriman satu media atau banyak media (album/carousel).
 * @param {object} sock - Socket Baileys.
 * @param {object} msg - Objek pesan asli.
 * @param {Array<object>} mediaList - Daftar media, format: [{ type: 'image' | 'video', url: string }].
 * @param {string} fullCaption - Caption lengkap untuk dikirim.
 */
async function sendMedia(sock, msg, mediaList, fullCaption) {
    const sender = msg.key.remoteJid;

    // KASUS 1: Cuma satu media, kirim langsung
    if (mediaList.length === 1) {
        const media = mediaList[0];
        console.log(`[IGDL] Mengirim media tunggal tipe: ${media.type}`);
        // Membuat objek media secara dinamis: { image: { url: ... } } atau { video: { url: ... } }
        await sock.sendMessage(sender, { [media.type]: { url: media.url }, caption: fullCaption }, { quoted: msg });
        return;
    }

    // KASUS 2: Lebih dari satu media, kirim sebagai album (carousel)
    // Diasumsikan bot Anda punya fungsi `sendAlbumMessage` atau sejenisnya.
    // Jika tidak, Anda harus mengirimnya satu per satu.
    if (mediaList.length > 1) {
        console.log(`[IGDL] Mengirim album berisi ${mediaList.length} media.`);
        const albumItems = mediaList.map((item, index) => {
            const mediaObject = { [item.type]: { url: item.url } };
            // Caption hanya ditaruh di item pertama album
            if (index === 0) {
                mediaObject.caption = fullCaption;
            }
            return mediaObject;
        });

        // Jika framework Anda tidak punya `.sendAlbumMessage`, ganti bagian ini
        // dengan loop untuk mengirim satu per satu.
        if (typeof sock.sendAlbumMessage === 'function') {
            await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
        } else {
            console.warn("[IGDL] sock.sendAlbumMessage tidak ada. Mengirim media satu per satu sebagai gantinya.");
            for (let i = 0; i < albumItems.length; i++) {
                await sock.sendMessage(sender, albumItems[i], { quoted: msg });
            }
        }
    }
}

/**
 * Fungsi utama untuk memulai proses download dari Instagram.
 */
async function startInstagramDownload(sock, msg, instagramUrl) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: 'Sip, bentar ya, lagi intip link IG-nya... 👀' }, { quoted: msg });

    // API UTAMA: /downloaders/ig (lebih detail)
    try {
        const apiUrl = `https://szyrineapi.biz.id/api/downloaders/ig?url=${encodeURIComponent(instagramUrl)}`;
        const response = await axios.get(apiUrl, { timeout: API_TIMEOUT });
        const data = response.data;

        if (response.status !== 200 || !data.result?.media || data.result.media.length === 0) {
            throw new Error('API utama (/ig) nggak ngasih hasil.');
        }

        const mediaList = data.result.media.map(item => ({
            type: item.tipe === 'video' ? 'video' : 'image', // Tipe: 'image' atau 'video'
            url: item.url
        }));

        const { caption } = data.result;
        const username = data.result.akun?.username;
        const fullCaption = `*Dari Postingan:* @${username || '?'}\n\n*Caption Asli:*\n${caption || 'Gak ada caption.'}\n\n${WATERMARK}`.trim();

        await sock.sendMessage(sender, { text: `Mantap, dapet *${mediaList.length}* media nih! OTW kirim... 🚀`, edit: statusMsg.key });
        await sendMedia(sock, msg, mediaList, fullCaption);
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (primaryError) {
        console.error('[IGDL Primary Error]', primaryError.message);
        await sock.sendMessage(sender, { text: 'Waduh, server utama lagi ngambek. Coba jalur lain ya... 🏃‍♂️', edit: statusMsg.key });

        // API CADANGAN: /downloaders/itt (lebih simpel)
        try {
            const fallbackApiUrl = `https://szyrineapi.biz.id/api/downloaders/itt?platform=instagram&url=${encodeURIComponent(instagramUrl)}`;
            const fallbackResponse = await axios.get(fallbackApiUrl, { timeout: API_TIMEOUT });
            const fallbackData = fallbackResponse.data;

            if (fallbackResponse.status !== 200 || !fallbackData.result?.download || fallbackData.result.download.length === 0) {
                throw new Error('Server cadangan juga ikutan gagal, ampun deh.');
            }

            const mediaList = fallbackData.result.download.map(url => ({
                type: url.includes('.mp4') ? 'video' : 'image',
                url: url
            }));

            const fullCaption = `*Download Berhasil!* ✨\n\n(via server cadangan)\n\n${WATERMARK}`.trim();
            
            await sock.sendMessage(sender, { text: `Asiik, dapet *${mediaList.length}* media dari server cadangan! Langsung kirim... ✨`, edit: statusMsg.key });
            await sendMedia(sock, msg, mediaList, fullCaption);
            await sock.sendMessage(sender, { delete: statusMsg.key });

        } catch (fallbackError) {
            console.error('[IGDL Fallback Error]', fallbackError.message);
            await sock.sendMessage(sender, { text: `Yah, gagal total nih 😭.\n*Alasan:* ${fallbackError.message}\nCoba lagi nanti ya.`, edit: statusMsg.key });
        }
    }
}

/**
 * Menangani input URL dari pengguna setelah perintah awal.
 */
async function handleUrlInput(sock, msg, body) {
    const url = body.trim();
    const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[\w-]+/;
    if (!url || !instagramRegex.test(url)) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Hmm, ini kayaknya bukan link post atau reel IG deh. Coba kirim link yang bener ya.' }, { quoted: msg });
    }
    await startInstagramDownload(sock, msg, url);
}

/**
 * Fungsi eksekusi utama yang dipanggil oleh command handler.
 */
export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args[0];
    if (userUrl) {
        await startInstagramDownload(sock, msg, userUrl);
    } else {
        await sock.sendMessage(sender, { text: 'Kirim link post atau reel Instagram yang mau di-download dong.' }, { quoted: msg });
        // Mengatur state untuk menunggu input URL dari pengguna
        if (extras && typeof extras.set === 'function') {
            await extras.set(sender, handleUrlInput, 120000, {}); // Tunggu 2 menit
        }
    }
}
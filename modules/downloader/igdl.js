// /modules/downloaders/igdl.js

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'downloaders';
export const description = 'Mengunduh media (foto/video/reels) dari Instagram.';
export const usage = `${BOT_PREFIX}igdl <link_instagram>`;
export const aliases = ['ig'];
export const energyCost = 4;

/**
 * Mengirim media yang telah didapatkan ke pengguna.
 * @param {object} sock - Socket Baileys.
 * @param {object} msg - Objek pesan asli.
 * @param {Array<object>} mediaList - Daftar media [{ type, url }].
 * @param {string} fullCaption - Caption lengkap untuk dikirim.
 */
async function sendMedia(sock, msg, mediaList, fullCaption) {
    const sender = msg.key.remoteJid;

    if (mediaList.length === 1) {
        const media = mediaList[0];
        // Mengirim media tunggal (foto atau video) dengan caption.
        await sock.sendMessage(sender, { [media.type]: { url: media.url }, caption: fullCaption }, { quoted: msg });
    } else {
        // Mengirim beberapa media sebagai album.
        const albumItems = mediaList.map((item, index) => ({
            [item.type]: { url: item.url },
            caption: index === 0 ? fullCaption : '' // Caption hanya pada item pertama.
        }));
        // Fungsi sendAlbumMessage diasumsikan ada di library/helper Anda.
        await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
    }
}

async function startInstagramDownload(sock, msg, instagramUrl) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Menganalisis link Instagram...' }, { quoted: msg });

    try {
        // Mencoba API utama terlebih dahulu (struktur respons detail)
        const primaryApiUrl = `https://szyrineapi.biz.id/api/downloaders/ig?url=${encodeURIComponent(instagramUrl)}`;
        const data = await safeApiGet(primaryApiUrl);

        if (!data?.result?.media || data.result.media.length === 0) {
            // Jika API utama tidak mengembalikan media, lempar error untuk memicu fallback.
            throw new Error('Media tidak ditemukan dari API utama.');
        }

        // Memproses data dari API utama
        const mediaList = data.result.media.map(item => ({
            type: item.tipe === 'foto' ? 'photo' : 'video', // Konversi 'foto' -> 'photo'
            url: item.url
        }));

        const { caption } = data.result;
        const username = data.result.akun?.username;
        const fullCaption = `*Username:* @${username || 'N/A'}\n\n${caption || 'Tanpa caption.'}\n\n${WATERMARK}`.trim();

        await sock.sendMessage(sender, { text: `✅ Berhasil mendapatkan *${mediaList.length}* media! Mengirim sekarang...`, edit: statusMsg.key });
        await sendMedia(sock, msg, mediaList, fullCaption);
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (primaryError) {
        console.error('[IGDL Primary Error]', primaryError.message);
        await sock.sendMessage(sender, { text: '⏳ Gagal dengan API utama. Mencoba API cadangan...', edit: statusMsg.key });

        try {
            // Mencoba API kedua (fallback) dari screenshot
            const fallbackApiUrl = `https://szyrineapi.biz.id/api/downloaders/itt?platform=instagram&url=${encodeURIComponent(instagramUrl)}`;
            const fallbackData = await safeApiGet(fallbackApiUrl);
            
            if (!fallbackData?.result?.download || fallbackData.result.download.length === 0) {
                throw new Error(fallbackData.message || 'Tidak dapat mengambil media dari kedua API.');
            }

            // Memproses data dari API cadangan
            const mediaUrls = fallbackData.result.download;
            const mediaList = mediaUrls.map(url => ({
                type: url.includes('.mp4') ? 'video' : 'photo', // Menebak tipe media dari URL
                url: url
            }));

            // API cadangan tidak menyediakan metadata
            const fullCaption = `*Catatan:* Informasi caption tidak tersedia.\n\n${WATERMARK}`.trim();
            
            await sock.sendMessage(sender, { text: `✅ Oke, dapat *${mediaList.length}* media dari API cadangan! Mengirim...`, edit: statusMsg.key });
            await sendMedia(sock, msg, mediaList, fullCaption);
            await sock.sendMessage(sender, { delete: statusMsg.key });

        } catch (fallbackError) {
            console.error('[IGDL Fallback Error]', fallbackError);
            await sock.sendMessage(sender, { text: `❌ Gagal total: ${fallbackError.message}`, edit: statusMsg.key });
        }
    }
}

async function handleUrlInput(sock, msg, body, waitState) {
    const url = body.trim();
    const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+/;
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
        await extras.set(sender, 'igdl_url', handleUrlInput, { extras, timeout: 120000, originalMsgKey: msg.key });
    }
}
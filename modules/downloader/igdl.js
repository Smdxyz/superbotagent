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
        await sock.sendMessage(sender, { [media.type]: { url: media.url }, caption: fullCaption }, { quoted: msg });
    } else {
        const albumItems = mediaList.map((item, index) => ({
            [item.type]: { url: item.url },
            caption: index === 0 ? fullCaption : ''
        }));
        await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
    }
}

async function startInstagramDownload(sock, msg, instagramUrl) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Menganalisis link Instagram...' }, { quoted: msg });

    // STRATEGI BARU: Coba API simpel (/itt) dulu, karena lebih stabil.
    try {
        const primaryApiUrl = `https://szyrineapi.biz.id/api/downloaders/itt?platform=instagram&url=${encodeURIComponent(instagramUrl)}`;
        const data = await safeApiGet(primaryApiUrl);

        // Perbaikan: Cek langsung 'data.download' bukan 'data.result.download'
        if (!data?.download || data.download.length === 0) {
            throw new Error('API utama (/itt) tidak mengembalikan media.');
        }

        const mediaUrls = data.download;
        const mediaList = mediaUrls.map(url => ({
            type: url.includes('.mp4') ? 'video' : 'photo', // Tipe media ditebak dari URL
            url: url
        }));
        
        // API ini tidak menyediakan caption, jadi kita buat caption default.
        const fullCaption = `*Download Berhasil!* ✨\n\n${WATERMARK}`.trim();

        await sock.sendMessage(sender, { text: `✅ Oke, dapet *${mediaList.length}* media! Ngirim sekarang...`, edit: statusMsg.key });
        await sendMedia(sock, msg, mediaList, fullCaption);
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (primaryError) {
        console.error('[IGDL Primary Error]', primaryError.message);
        await sock.sendMessage(sender, { text: '⏳ Gagal dengan API utama. Mencoba API cadangan...', edit: statusMsg.key });

        // FALLBACK: Coba API kedua (/ig) yang lebih detail tapi kurang stabil.
        try {
            const fallbackApiUrl = `https://szyrineapi.biz.id/api/downloaders/ig?url=${encodeURIComponent(instagramUrl)}`;
            const fallbackData = await safeApiGet(fallbackApiUrl);

            // API ini memiliki struktur 'result.media'
            if (!fallbackData?.result?.media || fallbackData.result.media.length === 0) {
                throw new Error(fallbackData.message || 'Tidak dapat mengambil media dari kedua API.');
            }

            const mediaList = fallbackData.result.media.map(item => ({
                type: item.tipe === 'foto' ? 'photo' : 'video',
                url: item.url
            }));

            const { caption } = fallbackData.result;
            const username = fallbackData.result.akun?.username;
            const fullCaption = `*Username:* @${username || 'N/A'}\n\n${caption || 'Tanpa caption.'}\n\n${WATERMARK}`.trim();
            
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
    // Regex untuk memastikan link adalah post atau reel Instagram
    const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[\w-]+/;
    if (!url || !instagramRegex.test(url)) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Link yang Anda kirim sepertinya bukan link post atau reel Instagram yang valid. Silakan coba lagi.' }, { quoted: msg });
    }
    await startInstagramDownload(sock, msg, url);
    // Hapus state setelah selesai, karena sudah tidak menunggu input lagi
    if (waitState && waitState.context && waitState.context.originalMsgKey) {
        await extras.clear(sender);
    }
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args[0];
    if (userUrl) {
        await startInstagramDownload(sock, msg, userUrl);
    } else {
        await sock.sendMessage(sender, { text: 'Silakan kirim link post atau reel Instagram yang ingin Anda unduh.' }, { quoted: msg });
        // Menggunakan extras.set yang diinjeksi oleh moduleRunner
        await extras.set(sender, handleUrlInput, 120000, { originalMsgKey: msg.key });
    }
}
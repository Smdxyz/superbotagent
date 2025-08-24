// /modules/downloaders/fb.js (REVISED & FIXED FOR MODERN WAITSTATE HANDLER)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'downloaders';
export const description = 'Mengunduh video dari tautan Facebook.';
export const usage = `${BOT_PREFIX}fb <url_video_facebook>`;
export const aliases = ['facebook', 'fbdl'];
export const energyCost = 6;

// --- HANDLER #2: Menangani Pilihan Kualitas (SD/HD) ---
// Signature fungsi diubah menjadi (sock, msg, body, context) sesuai standar baru.
async function handleQualitySelection(sock, msg, body, context) {
    const sender = msg.key.remoteJid;
    // Data sekarang diambil dari 'context', bukan 'waitState.dataTambahan'.
    const { sd, hd, title } = context;
    
    let urlToDownload, quality;

    // 'body' adalah ID dari tombol yang diklik.
    if (body === 'fb_dl_sd') {
        urlToDownload = sd;
        quality = 'SD';
    } else if (body === 'fb_dl_hd') {
        urlToDownload = hd;
        quality = 'HD';
    } else {
        // Jika input bukan dari tombol, abaikan saja.
        return;
    }

    if (!urlToDownload) {
        return sock.sendMessage(sender, { text: `Maaf Tuan, link untuk kualitas ${quality} tidak tersedia.` }, { quoted: msg });
    }
    
    const statusMsg = await sock.sendMessage(sender, { text: `✅ Oke, Aira siapkan video kualitas *${quality}*. Sabar ya...` }, { quoted: msg });
    
    try {
        // Mengirim video langsung dari URL (lebih efisien).
        await sock.sendMessage(sender, {
            video: { url: urlToDownload },
            caption: `*${title || 'Video Facebook'}*\n\nKualitas: ${quality}\n${WATERMARK}`
        }, { quoted: msg });
        await sock.sendMessage(sender, { delete: statusMsg.key });
    } catch (error) {
        console.error('[FB DL] Gagal mengirim video:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pas ngirim video: ${error.message}`, edit: statusMsg.key });
    }
}

// --- FUNGSI UTAMA: Memulai Proses Download ---
async function startFacebookDownload(sock, msg, userUrl, extras) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Lagi ngambil data video, harap tunggu...' }, { quoted: msg });
    
    try {
        const result = await safeApiGet(`https://szyrineapi.biz.id/api/downloaders/fb?url=${encodeURIComponent(userUrl)}`);
        // Logika parsing respons sudah benar, menangani array atau objek tunggal.
        const videoData = Array.isArray(result) ? result[0] : result;

        if (!videoData || (!videoData.normalQualityLink && !videoData.hdQualityLink)) {
            throw new Error('Tidak ditemukan link unduhan video di respons API.');
        }

        const buttons = [];
        if (videoData.normalQualityLink) {
            buttons.push({ buttonId: 'fb_dl_sd', buttonText: { displayText: 'Kualitas SD' }, type: 1 });
        }
        if (videoData.hdQualityLink) {
            buttons.push({ buttonId: 'fb_dl_hd', buttonText: { displayText: 'Kualitas HD' }, type: 1 });
        }
        
        const buttonMessage = {
            image: { url: videoData.thumbnail },
            caption: `*${videoData.title || 'Video Facebook'}*\n\n${videoData.description || ''}\n\nPilih kualitas video di bawah ini.`,
            footer: `Durasi: ${videoData.duration || 'N/A'}`,
            buttons: buttons,
            headerType: 4
        };

        await sock.sendMessage(sender, { delete: statusMsg.key });
        await sock.sendMessage(sender, buttonMessage, { quoted: msg });
        
        // --- PERBAIKAN KRUSIAL: Menggunakan 'extras.set' yang benar ---
        await extras.set(sender, 'fb_quality_selection', {
            handler: handleQualitySelection,
            context: {
                sd: videoData.normalQualityLink,
                hd: videoData.hdQualityLink,
                title: videoData.title
            },
            timeout: 120000
        });

    } catch (error) {
        console.error('[FB DL] Gagal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal ngambil data video: ${error.message}`, edit: statusMsg.key });
    }
}

// --- HANDLER #1: Menangani Input URL Jika Tidak Diberikan di Awal ---
async function handleUrlInput(sock, msg, body, context) {
    const url = body.trim();
    if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch'))) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Ini bukan link Facebook. Coba kirim lagi.' }, { quoted: msg });
    }
    // 'context.extras' meneruskan objek 'extras' ke fungsi berikutnya.
    await startFacebookDownload(sock, msg, url, context.extras);
}

// --- FUNGSI EKSEKUSI UTAMA ---
export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = text.trim();
    // Regex untuk validasi URL Facebook yang lebih baik
    const fbRegex = /https?:\/\/(?:www\.|m\.)?(?:facebook\.com|fb\.watch)\b/i;

    if (userUrl && fbRegex.test(userUrl)) {
        // Jika URL diberikan langsung, mulai prosesnya.
        await startFacebookDownload(sock, msg, userUrl, extras);
    } else {
        // Jika tidak ada URL, minta pengguna untuk mengirimkannya.
        await sock.sendMessage(sender, { text: `Kirim link video Facebook yang mau di-download.` }, { quoted: msg });
        // Set wait state untuk menangani URL yang akan dikirim pengguna.
        await extras.set(sender, 'fb_url_input', {
            handler: handleUrlInput,
            context: { extras }, // Penting: Teruskan 'extras' agar bisa dipakai di handler berikutnya
            timeout: 120000
        });
    }
}
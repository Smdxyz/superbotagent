// /modules/downloader/ytshorts.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'downloader';
export const description = 'Mendownload video dari tautan YouTube Shorts.';
export const usage = `${BOT_PREFIX}ytshorts <url_youtube_shorts>`;
export const aliases = ['shorts', 'shortdl'];
export const energyCost = 5;

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    const url = args[0];

    // Validasi input
    if (!url) {
        return sock.sendMessage(sender, { text: `Tolong berikan link YouTube Shorts-nya ya, Tuan.\n\nContoh: \`${usage}\`` }, { quoted: msg });
    }

    const youtubeShortsRegex = /(?:youtube\.com\/shorts\/|youtu\.be\/)/;
    if (!youtubeShortsRegex.test(url)) {
        return sock.sendMessage(sender, { text: `Sepertinya ini bukan link YouTube Shorts yang valid. Coba periksa lagi.` }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '📥 Aira lagi ambil videonya, sebentar ya...' }, { quoted: msg });

    try {
        // Panggil API untuk mendapatkan link download
        const response = await axios.get('https://szyrineapi.biz.id/api/youtube/download/shorts', {
            params: { url: url },
            timeout: 30000 // Timeout 30 detik
        });

        const result = response.data.result;

        if (response.data.status !== 200 || !result?.success || !result.download_url) {
            throw new Error(result?.message || 'Gagal mendapatkan data video dari API.');
        }

        // Kirim video ke pengguna
        await sock.sendMessage(sender, {
            video: { url: result.download_url },
            caption: result.title || 'Ini dia videonya, Tuan!'
        }, { quoted: msg });

        // Hapus pesan status awal
        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR YTSHORTS]', error);
        
        let errorMessage = 'Waduh, ada kesalahan saat Aira coba download videonya.';
        if (error.response?.data?.message) {
            errorMessage += `\n\n*Pesan dari Server:* ${error.response.data.message}`;
        } else {
            errorMessage += `\n\n*Detail:* ${error.message}`;
        }
        
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: errorMessage
        });
    }
}
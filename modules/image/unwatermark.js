// /modules/editor/unwatermark.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'editor';
export const description = 'Menghapus watermark dari sebuah gambar.';
export const usage = `Kirim/Reply foto dengan caption:\n${BOT_PREFIX}unwatermark`;
export const aliases = ['unwm', 'nowm', 'delwm'];
export const requiredTier = 'Basic';
export const energyCost = 5;

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let mediaMessage;

    // Cari gambar di pesan yang dikirim atau di pesan yang di-reply
    if (msg.message?.imageMessage) {
        mediaMessage = msg.message.imageMessage;
    } else if (quoted?.imageMessage) {
        mediaMessage = quoted.imageMessage;
    } else {
        return sock.sendMessage(sender, {
            text: `Mana gambarnya, Tuan? Kirim atau reply foto yang mau dibersihkan.`
        }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '💦 Aira lagi bersihin gambarnya dari noda-noda, tunggu sebentar...' }, { quoted: msg });

    try {
        // 1. Download gambar dari pesan WhatsApp
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let imageBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            imageBuffer = Buffer.concat([imageBuffer, chunk]);
        }

        // 2. Siapkan data dan kirim ke API
        const form = new FormData();
        form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

        const apiResponse = await axios.post('https://szyrineapi.biz.id/api/images/removebg/unwatermark', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000 // Timeout 1 menit untuk proses
        });

        const result = apiResponse.data.result;

        if (apiResponse.data.status !== 200 || !result?.success || !result.result_url) {
            throw new Error('Gagal memproses gambar. Respons dari API tidak valid atau tidak berhasil.');
        }

        const resultUrl = result.result_url;

        // 3. Kirim hasil gambar yang sudah bersih
        await sock.sendMessage(sender, {
            image: { url: resultUrl },
            caption: `Sudah bersih dari noda, Tuan! ✨`
        }, { quoted: msg });

        // Hapus pesan status awal
        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR UNWATERMARK]', error);
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `Waduh, Aira gagal bersihin gambarnya! 😭 Katanya ada masalah:\n\n*${error.message}*`
        });
    }
}
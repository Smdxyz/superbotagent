// /modules/ai/enhance.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { sleep } from '../../libs/utils.js';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Meningkatkan kualitas dan memperjelas detail foto (HD Remini).';
export const usage = `Kirim/Reply foto dengan caption:\n${BOT_PREFIX}enhance`;
export const aliases = ['hd', 'remini'];
export const requiredTier = 'Basic';
export const energyCost = 10;

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
            text: `Gambarnya mana? Kirim foto dengan caption atau reply foto yang ada.`
        }, { quoted: msg });
    }
    
    // Argumen 'creative' bersifat opsional, defaultnya 0.35 sesuai contoh
    const creativeLevel = args[0] || '0.35';

    const initialMsg = await sock.sendMessage(sender, { text: '✨ Aira lagi sulap fotomu jadi lebih jernih, tunggu ya...' }, { quoted: msg });

    try {
        // 1. Download gambar
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let imageBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            imageBuffer = Buffer.concat([imageBuffer, chunk]);
        }

        // 2. Kirim ke API untuk memulai job
        const form = new FormData();
        form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('creative', creativeLevel);

        const uploadResponse = await axios.post('https://szyrineapi.biz.id/api/images/pixnova/enhance', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000
        });

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data.result?.jobId) {
            throw new Error('Gagal memulai proses enhance. Respons API tidak valid.');
        }

        const { jobId, statusUrl } = uploadResponse.data.result;
        console.log(`[ENHANCE] Job berhasil dibuat. ID: ${jobId}`);

        // 3. Polling status
        let finalImageUrl = null;
        const maxRetries = 25;
        const retryDelay = 3000;

        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `✅ Oke, proses peningkatan kualitas gambar dimulai! (Job ID: ${jobId.slice(0, 15)})`
        });

        for (let i = 0; i < maxRetries; i++) {
            await sleep(retryDelay);
            const statusResponse = await axios.get(statusUrl, { timeout: 20000 });
            const resultData = statusResponse.data.result;

            if (resultData.status === 'completed') {
                finalImageUrl = resultData.result?.imageUrl;
                break;
            } else if (resultData.status !== 'processing') {
                 throw new Error(`Proses gagal di server dengan status: '${resultData.status}'.`);
            }
        }

        // 4. Kirim hasil
        if (!finalImageUrl) {
            throw new Error('Gagal mendapatkan hasil (timeout). Server mungkin sedang sibuk.');
        }

        await sock.sendMessage(sender, {
            image: { url: finalImageUrl },
            caption: `Ini dia hasilnya, jadi lebih tajam kan? ✨`
        }, { quoted: msg });

        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR ENHANCE]', error);
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `Waduh, gagal bikin HD! 😭 Gini katanya:\n\n*${error.message}*`
        });
    }
}
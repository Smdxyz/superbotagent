// /modules/ai/gantirambut.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { sleep } from '../../libs/utils.js';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Mengubah gaya rambut pada sebuah foto berdasarkan deskripsi teks.';
export const usage = `Kirim/Reply foto dengan caption:\n${BOT_PREFIX}gantirambut <model rambut>`;
export const aliases = ['hairai', 'ubahrambut'];
export const requiredTier = 'Basic';
export const energyCost = 15;

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    // --- VALIDASI INPUT ---
    const prompt = text.trim();
    if (!prompt) {
        return sock.sendMessage(sender, {
            text: `Perintahnya belum lengkap. Kamu mau ganti rambut jadi model apa?\n\n*Contoh:*\n*${BOT_PREFIX}gantirambut model bob pirang*`
        }, { quoted: msg });
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let mediaMessage;

    // Cari gambar di pesan yang dikirim atau di pesan yang di-reply
    if (msg.message?.imageMessage) {
        mediaMessage = msg.message.imageMessage;
    } else if (quoted?.imageMessage) {
        mediaMessage = quoted.imageMessage;
    } else {
        return sock.sendMessage(sender, {
            text: `Gambarnya mana? Kirim foto dengan caption atau reply foto yang sudah ada.`
        }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '✂️ Aira lagi siapin alat salon, tunggu sebentar ya...' }, { quoted: msg });

    try {
        // 1. Download gambar dari WhatsApp
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let imageBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            imageBuffer = Buffer.concat([imageBuffer, chunk]);
        }

        // 2. Kirim gambar dan prompt ke API (POST Request)
        const form = new FormData();
        form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('prompt', prompt);

        const uploadResponse = await axios.post('https://szyrineapi.biz.id/api/images/pixnova/change-hair', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000 // Timeout 60 detik
        });

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data.result?.jobId) {
            throw new Error('Gagal memulai proses di server. Respons API tidak valid.');
        }

        const { jobId, statusUrl } = uploadResponse.data.result;
        console.log(`[CHANGEHAIR] Job berhasil dibuat. ID: ${jobId}`);

        // 3. Polling status (alur yang sudah familiar)
        let finalImageUrl = null;
        const maxRetries = 25;
        const retryDelay = 3000;

        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `✅ Oke, Aira mulai potong rambut sesuai model "${prompt.substring(0, 20)}..."! (Job ID: ${jobId.slice(0, 15)})`
        });

        for (let i = 0; i < maxRetries; i++) {
            await sleep(retryDelay);
            const statusResponse = await axios.get(statusUrl, { timeout: 20000 });
            const resultData = statusResponse.data.result;

            if (resultData.status === 'completed') {
                finalImageUrl = resultData.result?.imageUrl;
                console.log(`[CHANGEHAIR] Job ${jobId} selesai. URL Gambar: ${finalImageUrl}`);
                break;
            } else if (resultData.status === 'processing') {
                console.log(`[CHANGEHAIR] Job ${jobId} masih diproses... (${resultData.step})`);
            } else {
                throw new Error(`Proses gagal di server dengan status: '${resultData.status}'. Pesan: ${resultData.step || 'Tidak ada info'}`);
            }
        }

        // 4. Kirim hasil
        if (!finalImageUrl) {
            throw new Error('Gagal mendapatkan hasil gambar setelah beberapa kali mencoba (timeout). Server mungkin sedang sibuk.');
        }

        await sock.sendMessage(sender, {
            image: { url: finalImageUrl },
            caption: `Ini dia gaya rambut barunya! Gimana, cocok kan? ✨`
        }, { quoted: msg });

        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR CHANGEHAIR]', error);
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `Gagal ganti rambut! 😭 Penyebabnya:\n\n*${error.message}*`
        });
    }
}
// /modules/ai/figure.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { sleep } from '../../libs/utils.js';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Mengubah foto seseorang menjadi model action figure skala 1/7.';
export const usage = `Kirim/Reply foto dengan caption:\n${BOT_PREFIX}figure [prompt]\n\nCatatan: Prompt bersifat opsional. Jika kosong, akan menggunakan prompt default.`;
export const aliases = ['nanobanana', 'tofigure'];
export const requiredTier = 'Basic';
export const energyCost = 15; // Sedikit lebih mahal karena prosesnya lebih kompleks

// =================================================================
// PROMPT DEFAULT
// =================================================================

const DEFAULT_PROMPT = "Draw A Prospective Model Of The Character In The Picture, Commercialized As A 1/7 Scale Full Body Figure. Please Make This Image Into A 517 Real-lifeFigure Photo. Place The Figurine Version Of The Photo | Provided On A Round Black Plastic Pedestal. I Would Like The Pvc Material To Be ClearlyVisible. The Background Should Be A Computer Desk.";

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
            text: `Gambarnya mana, Tuan? Kirim foto dengan caption atau reply foto yang ada.`
        }, { quoted: msg });
    }

    // Gunakan prompt dari user jika ada, jika tidak pakai prompt default
    const userPrompt = text.trim() || DEFAULT_PROMPT;

    const initialMsg = await sock.sendMessage(sender, { text: '🎨 Aira lagi siapin studio buat bikin figurmu, mohon ditunggu...' }, { quoted: msg });

    try {
        // 1. Download gambar dari pesan WhatsApp
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let imageBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            imageBuffer = Buffer.concat([imageBuffer, chunk]);
        }

        // 2. Siapkan data dan kirim ke API untuk memulai job
        const form = new FormData();
        form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('prompt', userPrompt);

        const uploadResponse = await axios.post('https://szyrineapi.biz.id/api/images/edit/nanobanana', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000 // Timeout 1 menit untuk upload
        });

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data.result?.jobId) {
            throw new Error('Gagal memulai proses pembuatan figur. Respons API tidak valid.');
        }

        const { jobId, statusUrl } = uploadResponse.data.result;
        console.log(`[FIGURE] Job berhasil dibuat. ID: ${jobId}`);

        // 3. Lakukan polling untuk mengecek status job
        let finalImageUrl = null;
        const maxRetries = 30; // Maksimal 30 kali coba (sekitar 1.5 menit)
        const retryDelay = 3000; // Jeda 3 detik antar percobaan

        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `✅ Oke, proses pembuatan figur dimulai! (Job ID: ${jobId.slice(0, 15)})`
        });

        for (let i = 0; i < maxRetries; i++) {
            await sleep(retryDelay);
            const statusResponse = await axios.get(statusUrl, { timeout: 20000 });
            const resultData = statusResponse.data.result;

            if (resultData.status === 'completed') {
                finalImageUrl = resultData.result?.url; // Ambil URL dari nested result
                break;
            } else if (resultData.status !== 'processing' && resultData.status !== 'pending') {
                 throw new Error(`Proses di server gagal dengan status: '${resultData.status}'.`);
            }
        }

        // 4. Kirim hasil jika berhasil
        if (!finalImageUrl) {
            throw new Error('Gagal mendapatkan hasil (timeout). Server mungkin sedang sibuk atau prosesnya terlalu lama.');
        }

        await sock.sendMessage(sender, {
            image: { url: finalImageUrl },
            caption: `Ini dia figurmu sudah jadi! Keren kan? ✨`
        }, { quoted: msg });

        // Hapus pesan status awal
        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR FIGURE]', error);
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `Waduh, Aira gagal bikin figurnya! 😭 Katanya ada masalah:\n\n*${error.message}*`
        });
    }
}
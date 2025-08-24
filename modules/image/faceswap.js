// /modules/ai/faceswap.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { sleep } from '../../libs/utils.js';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Menukar wajah di satu foto dengan wajah dari foto lain.';
export const usage = `Reply foto sumber dengan foto wajah, lalu ketik:\n${BOT_PREFIX}faceswap`;
export const aliases = ['swapface', 'tukarwajah'];
export const requiredTier = 'Basic';
export const energyCost = 15; // Biaya lebih tinggi karena prosesnya lebih kompleks

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // --- VALIDASI INPUT ---
    // 1. Perintah harus berupa reply
    if (!quoted) {
        return sock.sendMessage(sender, { text: `Perintah salah. Anda harus me-reply foto sumber.` }, { quoted: msg });
    }
    // 2. Pesan yang di-reply harus berisi gambar (ini adalah gambar SUMBER)
    const sourceMedia = quoted.imageMessage;
    if (!sourceMedia) {
        return sock.sendMessage(sender, { text: `Foto sumber tidak ditemukan. Pastikan Anda me-reply sebuah gambar.` }, { quoted: msg });
    }
    // 3. Pesan saat ini harus berisi gambar (ini adalah gambar WAJAH)
    const faceMedia = msg.message?.imageMessage;
    if (!faceMedia) {
        return sock.sendMessage(sender, { text: `Foto wajah tidak ditemukan. Kirim foto wajah sambil me-reply foto sumber.` }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '🤝 Aira lagi proses tukar wajah, ini butuh konsentrasi tinggi...' }, { quoted: msg });

    try {
        // 1. Download kedua gambar
        const downloadSourcePromise = downloadContentFromMessage(sourceMedia, 'image');
        const downloadFacePromise = downloadContentFromMessage(faceMedia, 'image');
        const [sourceStream, faceStream] = await Promise.all([downloadSourcePromise, downloadFacePromise]);

        let sourceBuffer = Buffer.from([]);
        for await (const chunk of sourceStream) {
            sourceBuffer = Buffer.concat([sourceBuffer, chunk]);
        }

        let faceBuffer = Buffer.from([]);
        for await (const chunk of faceStream) {
            faceBuffer = Buffer.concat([faceBuffer, chunk]);
        }

        // 2. Kirim kedua gambar ke API untuk memulai proses (POST Request)
        const form = new FormData();
        form.append('source', sourceBuffer, { filename: 'source.jpg', contentType: 'image/jpeg' });
        form.append('face', faceBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });

        const uploadResponse = await axios.post('https://szyrineapi.biz.id/api/images/pixnova/faceswap', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000 // Timeout 60 detik untuk upload
        });

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data.result?.jobId) {
            throw new Error('Gagal memulai proses faceswap. Respons API tidak valid.');
        }

        const { jobId, statusUrl } = uploadResponse.data.result;
        console.log(`[FACESWAP] Job berhasil dibuat. ID: ${jobId}`);

        // 3. Polling status (sama seperti toanime)
        let finalImageUrl = null;
        const maxRetries = 25;
        const retryDelay = 3000;

        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `✅ Wajah & target terdeteksi! Aira mulai operasi plastik... (Job ID: ${jobId.slice(0, 15)})`
        });

        for (let i = 0; i < maxRetries; i++) {
            await sleep(retryDelay);
            const statusResponse = await axios.get(statusUrl, { timeout: 20000 });
            const resultData = statusResponse.data.result;

            if (resultData.status === 'completed') {
                finalImageUrl = resultData.result?.imageUrl;
                console.log(`[FACESWAP] Job ${jobId} selesai. URL Gambar: ${finalImageUrl}`);
                break;
            } else if (resultData.status === 'processing') {
                console.log(`[FACESWAP] Job ${jobId} masih diproses... (${resultData.step})`);
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
            caption: 'Operasi berhasil! 🤣 Gimana, cocok nggak?'
        }, { quoted: msg });

        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR FACESWAP]', error);
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `Operasi gagal total! 😭 Ini penyebabnya:\n\n*${error.message}*`
        });
    }
}
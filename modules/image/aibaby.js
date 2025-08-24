// /modules/ai/aibaby.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { sleep } from '../../libs/utils.js';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Memprediksi wajah bayi dari foto ayah dan ibu menggunakan AI.';
export const usage = `Reply foto ayah dengan foto ibu, lalu ketik:\n${BOT_PREFIX}aibaby <boy/girl>`;
export const aliases = ['bayiai', 'prediksibayi'];
export const requiredTier = 'Basic';
export const energyCost = 20; // Biaya lebih tinggi karena prosesnya cukup lama

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // --- VALIDASI INPUT ---
    // 1. Validasi argumen gender
    const gender = args[0]?.toLowerCase();
    if (gender !== 'boy' && gender !== 'girl') {
        return sock.sendMessage(sender, {
            text: `Tolong tentukan jenis kelaminnya! Contoh:\n*${BOT_PREFIX}aibaby boy* atau *${BOT_PREFIX}aibaby girl*`
        }, { quoted: msg });
    }

    // 2. Validasi gambar (mirip faceswap)
    if (!quoted) {
        return sock.sendMessage(sender, { text: `Perintah salah. Anda harus me-reply foto calon ayah.` }, { quoted: msg });
    }
    const fatherMedia = quoted.imageMessage;
    if (!fatherMedia) {
        return sock.sendMessage(sender, { text: `Foto calon ayah tidak ditemukan. Pastikan Anda me-reply sebuah gambar.` }, { quoted: msg });
    }
    const motherMedia = msg.message?.imageMessage;
    if (!motherMedia) {
        return sock.sendMessage(sender, { text: `Foto calon ibu tidak ditemukan. Kirim foto ibu sambil me-reply foto ayah.` }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '👶 Aira lagi meramal masa depan, butuh waktu buat nerawang...' }, { quoted: msg });

    try {
        // 1. Download kedua gambar
        const downloadFatherPromise = downloadContentFromMessage(fatherMedia, 'image');
        const downloadMotherPromise = downloadContentFromMessage(motherMedia, 'image');
        const [fatherStream, motherStream] = await Promise.all([downloadFatherPromise, downloadMotherPromise]);

        let fatherBuffer = Buffer.from([]);
        for await (const chunk of fatherStream) {
            fatherBuffer = Buffer.concat([fatherBuffer, chunk]);
        }

        let motherBuffer = Buffer.from([]);
        for await (const chunk of motherStream) {
            motherBuffer = Buffer.concat([motherBuffer, chunk]);
        }

        // 2. Kirim gambar & gender ke API (POST Request)
        const form = new FormData();
        form.append('father', fatherBuffer, { filename: 'father.jpg', contentType: 'image/jpeg' });
        form.append('mother', motherBuffer, { filename: 'mother.jpg', contentType: 'image/jpeg' });
        form.append('gender', gender);

        const uploadResponse = await axios.post('https://szyrineapi.biz.id/api/images/pixnova/ai-baby', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000 // Timeout 60 detik
        });

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data.result?.jobId) {
            throw new Error('Gagal memulai proses prediksi. Respons API tidak valid.');
        }

        const { jobId, statusUrl } = uploadResponse.data.result;
        console.log(`[AIBABY] Job berhasil dibuat. ID: ${jobId}`);

        // 3. Polling status
        let finalImageUrl = null;
        const maxRetries = 30; // Ditingkatkan karena prosesnya lebih lama
        const retryDelay = 3500; // Jeda sedikit lebih lama

        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `✅ Data Ayah & Ibu diterima! Proses penciptaan dimulai... Sabar ya, ini agak lama. (Job ID: ${jobId.slice(0, 15)})`
        });

        for (let i = 0; i < maxRetries; i++) {
            await sleep(retryDelay);
            const statusResponse = await axios.get(statusUrl, { timeout: 20000 });
            const resultData = statusResponse.data.result;

            if (resultData.status === 'completed') {
                finalImageUrl = resultData.result?.imageUrl;
                console.log(`[AIBABY] Job ${jobId} selesai. URL Gambar: ${finalImageUrl}`);
                break;
            } else if (resultData.status === 'processing') {
                console.log(`[AIBABY] Job ${jobId} masih diproses... (${resultData.step})`);
            } else {
                throw new Error(`Proses gagal di server dengan status: '${resultData.status}'. Pesan: ${resultData.step || 'Tidak ada info'}`);
            }
        }

        // 4. Kirim hasil
        if (!finalImageUrl) {
            throw new Error('Gagal mendapatkan hasil gambar setelah menunggu cukup lama (timeout). Server mungkin sedang sangat sibuk.');
        }

        await sock.sendMessage(sender, {
            image: { url: finalImageUrl },
            caption: `Selamat! 🎉 Ini dia prediksi wajah anak kalian nanti~ Lucu yaa?`
        }, { quoted: msg });

        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR AIBABY]', error);
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `Waduh, ramalannya gagal! 😭 Gini penyebabnya:\n\n*${error.message}*`
        });
    }
}
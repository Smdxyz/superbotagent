// /modules/ai/toanime.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import axios from 'axios';
import FormData from 'form-data';
import { sleep } from '../../libs/utils.js';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Mengubah foto (terutama wajah) menjadi gambar gaya anime menggunakan AI.';
export const usage = `${BOT_PREFIX}toanime`;
export const aliases = ['jadianime'];
export const requiredTier = 'Basic';
export const energyCost = 10; // Biaya energi lebih tinggi karena prosesnya multi-langkah

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
            text: `Perintah salah! Kirim foto dengan caption *${BOT_PREFIX}toanime* atau reply foto yang ada dengan perintah tersebut.`
        }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '✨ Aira lagi sulap fotomu jadi anime, sabar yaa...' }, { quoted: msg });

    try {
        // 1. Download gambar dari WhatsApp
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let imageBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            imageBuffer = Buffer.concat([imageBuffer, chunk]);
        }

        // 2. Kirim gambar ke API untuk memulai proses (POST Request)
        const form = new FormData();
        form.append('model', 'anime');
        form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

        const uploadResponse = await axios.post('https://szyrineapi.biz.id/api/images/pixnova/img2anime', form, {
            headers: { ...form.getHeaders() },
            timeout: 45000 // Timeout 45 detik untuk upload
        });

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data.result?.jobId) {
            throw new Error('Gagal memulai proses di server. Respons API tidak valid.');
        }

        const { jobId, statusUrl } = uploadResponse.data.result;
        console.log(`[TOANIME] Job berhasil dibuat. ID: ${jobId}`);

        // 3. Polling (memeriksa status) secara berkala (GET Request)
        let finalImageUrl = null;
        const maxRetries = 20; // Maksimal 20 kali percobaan (sekitar 1 menit)
        const retryDelay = 3000; // Jeda 3 detik antar percobaan

        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: `✅ Fotomu udah masuk antrian! Aira bakal cek hasilnya setiap beberapa detik ya... (Job ID: ${jobId.slice(0, 15)})`
        });

        for (let i = 0; i < maxRetries; i++) {
            await sleep(retryDelay);
            const statusResponse = await axios.get(statusUrl, { timeout: 15000 });
            const resultData = statusResponse.data.result;

            if (resultData.status === 'completed') {
                finalImageUrl = resultData.result?.imageUrl;
                console.log(`[TOANIME] Job ${jobId} selesai. URL Gambar: ${finalImageUrl}`);
                break; // Keluar dari loop jika sudah selesai
            } else if (resultData.status === 'processing') {
                console.log(`[TOANIME] Job ${jobId} masih diproses... (${resultData.step})`);
                // Tetap di dalam loop
            } else {
                // Jika statusnya error atau tidak dikenali
                throw new Error(`Proses gagal di server dengan status: '${resultData.status}'. Pesan: ${resultData.step || 'Tidak ada info'}`);
            }
        }

        // 4. Periksa hasil dan kirim ke pengguna
        if (!finalImageUrl) {
            throw new Error('Gagal mendapatkan hasil gambar setelah beberapa kali mencoba (timeout). Server mungkin sedang sibuk.');
        }

        await sock.sendMessage(sender, {
            image: { url: finalImageUrl },
            caption: 'Tadaa! 🪄 Versi anime kamu udah jadi~ Suka nggak?'
        }, { quoted: msg });
        
        // Hapus pesan status awal
        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR TOANIME]', error);
        
        // Hapus atau edit pesan status awal menjadi pesan error
        await sock.sendMessage(sender, {
             edit: initialMsg.key,
             text: `Yah, gagal... 😭 Gini katanya:\n\n*${error.message}*`
        });
    }
}
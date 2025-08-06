// /modules/images/faceswap.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';
import FormData from 'form-data'; // Diperlukan untuk mengirim multipart/form-data

export const category = 'images';
export const description = 'Menukar wajah dari satu gambar ke gambar lain menggunakan AI.';
export const usage = `Kirim gambar (wajah) dengan caption *${BOT_PREFIX}faceswap* sambil me-reply gambar (utama).`;
export const aliases = ['swapface'];
export const energyCost = 15; // Fitur AI biasanya lebih mahal

// Helper function untuk mengubah stream menjadi buffer
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Fungsi utama untuk menjalankan perintah faceswap
 */
export default async function execute(sock, msg) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // GAMBAR 1 (SOURCE): Gambar utama yang wajahnya akan diganti. Harus di-reply.
    const sourceImageMessage = quoted?.imageMessage;
    // GAMBAR 2 (FACE): Gambar yang berisi wajah untuk ditempelkan. Dikirim bersama perintah.
    const faceImageMessage = msg.message?.imageMessage;

    // Validasi input
    if (!sourceImageMessage || !faceImageMessage) {
        const helpText = `Yah, caranya salah tuh. Gini yang bener:\n\n1. Cari gambar *utama* yang mau kamu ganti wajahnya.\n2. *Reply* gambar itu.\n3. Kirim gambar kedua (yang ada *wajahnya*) dengan caption *${BOT_PREFIX}faceswap*.`;
        return await sock.sendMessage(sender, { text: helpText }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: 'Oke, siap! Lagi proses tukar wajah, sabar ya... 👨‍🔬✨' }, { quoted: msg });

        // Download kedua gambar secara bersamaan
        console.log('[FACESWAP] Mendownload gambar source & face...');
        const [sourceStream, faceStream] = await Promise.all([
            downloadContentFromMessage(sourceImageMessage, 'image'),
            downloadContentFromMessage(faceImageMessage, 'image')
        ]);

        // Ubah stream menjadi buffer
        const [sourceBuffer, faceBuffer] = await Promise.all([
            streamToBuffer(sourceStream),
            streamToBuffer(faceStream)
        ]);
        
        console.log('[FACESWAP] Gambar berhasil di-download. Membuat form data...');
        await sock.sendMessage(sender, { text: '✅ Gambar siap. Memulai operasi pertukaran wajah dengan AI Pixnova...', edit: processingMsg.key });

        // Siapkan data untuk dikirim sebagai multipart/form-data
        const formData = new FormData();
        // 'source' dan 'face' harus sesuai dengan nama field di API
        formData.append('source', sourceBuffer, 'source_image.jpg');
        formData.append('face', faceBuffer, 'face_image.jpg');

        // Panggil API
        console.log('[FACESWAP] Mengirim permintaan ke API Szyrine...');
        const apiUrl = 'https://szyrineapi.biz.id/api/images/pixnova/faceswap';
        const response = await axios.post(apiUrl, formData, {
            headers: {
                ...formData.getHeaders(), // Penting untuk multipart/form-data
            },
            responseType: 'arraybuffer', // Hasilnya adalah gambar langsung (buffer)
            timeout: 120000 // Timeout 2 menit untuk proses AI
        });
        
        if (!response.data || response.data.length < 1000) { // Cek jika hasilnya bukan gambar valid
             throw new Error("API tidak mengembalikan hasil gambar yang valid.");
        }

        // Kirim hasil gambar
        const caption = `Nih, hasil tukar wajahnya! Keren kan?\n\n${WATERMARK}`;
        await sock.sendMessage(sender, { image: response.data, caption: caption }, { quoted: msg });

        // Hapus pesan "memproses"
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[FACESWAP] Gagal total:', error);
        
        // Coba parsing error dari API jika ada
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            try {
                // Jika error adalah JSON, coba baca messagenya
                const errorJson = JSON.parse(error.response.data.toString());
                if (errorJson.message) {
                    errorMessage = errorJson.message;
                }
            } catch (e) {
                // Jika error bukan JSON, tampilkan sebagai teks biasa
                errorMessage = error.response.data.toString();
            }
        }

        const failureText = `Waduh, gagal nih 😭.\n*Alasan:* ${errorMessage}`;
        
        // Edit pesan yang sudah ada atau kirim baru jika gagal
        try {
            await sock.sendMessage(sender, { text: failureText, edit: processingMsg.key });
        } catch (editError) {
            await sock.sendMessage(sender, { text: failureText }, { quoted: msg });
        }
    }
}
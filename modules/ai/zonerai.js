// /modules/ai/zoner.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Membuat gambar berdasarkan teks (prompt) menggunakan model Zoner.';
export const usage = `${BOT_PREFIX}zoner <prompt> | <ukuran>\n\nContoh: ${BOT_PREFIX}zoner seekor kucing memakai topi penyihir | 1024x1024`;
export const aliases = ['text2img', 'createimg', 'imagine'];
export const energyCost = 10;

// =================================================================
// KONFIGURASI & DATA
// =================================================================

const AVAILABLE_SIZES = [
    "1216x832", "1152x896", "1344x768", "1563x640",
    "832x1216", "896x1152", "768x1344", "640x1536",
    "1024x1024"
];
const DEFAULT_SIZE = "1024x1024";

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    // Memisahkan prompt dan ukuran menggunakan separator '|'
    const parts = text.split('|').map(p => p.trim());
    const prompt = parts[0];
    let size = parts[1] || DEFAULT_SIZE;

    // --- Validasi Input ---
    if (!prompt) {
        return sock.sendMessage(sender, { 
            text: `Tolong berikan deskripsi gambar yang mau dibuat ya, Tuan.\n\nContoh Penggunaan:\n\`${usage}\``
        }, { quoted: msg });
    }

    if (!AVAILABLE_SIZES.includes(size)) {
        return sock.sendMessage(sender, {
            text: `Ukuran '${size}' tidak valid, Tuan. Pilih salah satu dari ukuran berikut:\n\n- ${AVAILABLE_SIZES.join('\n- ')}`
        }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(sender, { text: '🎨 Aira lagi melukis sesuai imajinasimu, ini butuh waktu sebentar...' }, { quoted: msg });

    try {
        // Panggil API dengan parameter prompt dan size
        const response = await axios.get('https://szyrineapi.biz.id/api/images/create/zoner', {
            params: {
                prompt: prompt,
                size: size,
            },
            responseType: 'arraybuffer', // PENTING: Minta axios untuk menerima respons sebagai data biner
            timeout: 90000 // Timeout 90 detik, karena AI image gen bisa lama
        });

        // Cek jika respons adalah gambar yang valid
        if (!response.data || response.headers['content-type'].indexOf('image') === -1) {
            throw new Error('API tidak mengembalikan gambar yang valid. Mungkin prompt Anda tidak sesuai (NSFW?).');
        }

        // Kirim gambar yang diterima sebagai buffer
        await sock.sendMessage(sender, {
            image: response.data, // Langsung kirim buffer datanya
            caption: `Ini dia lukisan dari Aira!\n\n*Prompt:* ${prompt}`
        }, { quoted: msg });

        // Hapus pesan status awal
        await sock.sendMessage(sender, { delete: initialMsg.key });

    } catch (error) {
        console.error('[ERROR ZONER]', error);
        let errorMessage = 'Waduh, kuas lukis Aira patah! Gagal membuat gambar.';
        
        // Cek jika error dari axios dan coba berikan pesan yang lebih spesifik
        if (error.response) {
            errorMessage += `\n\n*Alasan:* Server memberikan status ${error.response.status}. Mungkin ada masalah di sana.`;
        } else {
            errorMessage += `\n\n*Detail:* ${error.message}`;
        }
        
        await sock.sendMessage(sender, {
            edit: initialMsg.key,
            text: errorMessage
        });
    }
}
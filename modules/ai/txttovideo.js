// /modules/ai/txt2video.js

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

// =================================================================
// METADATA COMMAND
// =================================================================

export const category = 'ai';
export const description = 'Membuat video pendek dari deskripsi teks (prompt) menggunakan AI.';
export const usage = `${BOT_PREFIX}txt2video <deskripsi video>`;
export const aliases = ['tovideo', 'text2video'];
export const requiredTier = 'Gold'; // Fitur canggih, butuh tier lebih tinggi
export const energyCost = 25; // Biaya energi tinggi karena prosesnya berat

// =================================================================
// FUNGSI UTAMA COMMAND
// =================================================================

export default async function execute(sock, msg, args, text, sender) {
    const prompt = text.trim();

    if (!prompt) {
        return sock.sendMessage(sender, {
            text: `Kamu mau Aira bikinin video tentang apa? Kasih deskripsi yang jelas ya!\n\n*Contoh:*\n*${BOT_PREFIX}txt2video seekor kucing oren mengendarai sepeda di bulan*`
        }, { quoted: msg });
    }

    let statusMsg;
    try {
        statusMsg = await sock.sendMessage(sender, { text: `🎥 Aira mulai berimajinasi dan merangkai video untukmu... Ini mungkin butuh waktu agak lama, jadi sabar ya!` }, { quoted: msg });

        const apiUrl = `https://szyrineapi.biz.id/api/ai/txt2video?prompt=${encodeURIComponent(prompt)}`;
        
        // Memanggil API menggunakan helper yang aman
        const apiResponse = await safeApiGet(apiUrl);

        // Validasi respons dari API
        const videoUrl = apiResponse?.result?.url;
        if (!apiResponse?.success || !videoUrl) {
            throw new Error(apiResponse.message || 'API tidak mengembalikan URL video yang valid. Coba prompt lain.');
        }

        console.log(`[TXT2VIDEO] Video berhasil dibuat. URL: ${videoUrl}`);

        await sock.sendMessage(sender, { text: `✅ Imajinasi selesai! Aira berhasil membuat videonya. Mengirim...`, edit: statusMsg.key });

        // Mengirim video langsung dari URL
        await sock.sendMessage(sender, {
            video: { url: videoUrl },
            caption: `Ini dia videonya, Tuan!\n\n*Prompt:* _${prompt}_\n\n${WATERMARK}`
        }, { quoted: msg });

        // Hapus pesan status setelah berhasil
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (error) {
        console.error('[ERROR TXT2VIDEO]', error);
        const errorMessage = `Waduh, proyektor Aira rusak! 😭 Gagal bikin video:\n\n*Penyebab:* ${error.message}`;
        
        if (statusMsg) {
            await sock.sendMessage(sender, { text: errorMessage, edit: statusMsg.key });
        } else {
            await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
        }
    }
}
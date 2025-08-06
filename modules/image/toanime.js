// /modules/images/toanime.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';
import FormData from 'form-data';

export const category = 'images';
export const description = 'Mengubah foto menjadi gambar gaya anime.';
export const usage = `Kirim/reply gambar dengan caption *${BOT_PREFIX}toanime [kekuatan]*\n\nContoh: *${BOT_PREFIX}toanime* atau *${BOT_PREFIX}toanime 0.7*`;
export const aliases = ['jadianime'];
export const energyCost = 8;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export default async function execute(sock, msg, args) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = quoted?.imageMessage || msg.message?.imageMessage;

    if (!imageMessage) {
        return await sock.sendMessage(sender, { text: `Gambarnya mana woy? ${usage}` }, { quoted: msg });
    }

    // Ambil nilai kekuatan, defaultnya 0.5 jika tidak ada
    let strength = parseFloat(args[0]) || 0.5;
    if (strength < 0.1 || strength > 1.0) {
        return await sock.sendMessage(sender, { text: 'Kekuatan animenya harus antara 0.1 sampai 1.0 ya.' }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `Oke, siap! Mengubah fotomu jadi anime dengan kekuatan ${strength}... ✨` }, { quoted: msg });

        const stream = await downloadContentFromMessage(imageMessage, 'image');
        const buffer = await streamToBuffer(stream);

        const formData = new FormData();
        formData.append('image', buffer, 'image.jpg');
        formData.append('strength', strength.toString());

        const apiUrl = 'https://szyrineapi.biz.id/api/images/pixnova/img2anime';
        const response = await axios.post(apiUrl, formData, {
            headers: { ...formData.getHeaders() },
            responseType: 'arraybuffer',
            timeout: 90000
        });

        if (!response.data || response.data.length < 1000) {
            throw new Error("API nggak ngasih hasil gambar yang bener.");
        }

        const caption = `Ini dia versi anime-nya! Keren gak?\n\n${WATERMARK}`;
        await sock.sendMessage(sender, { image: response.data, caption: caption }, { quoted: msg });
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[TOANIME ERROR]', error);
        let errorMessage = error.message;
        if (error.response?.data) {
           try { errorMessage = JSON.parse(error.response.data.toString()).message } catch {}
        }
        await sock.sendMessage(sender, { text: `Yah, gagal jadi anime 😭.\n*Alasan:* ${errorMessage}` }, { quoted: msg });
    }
}
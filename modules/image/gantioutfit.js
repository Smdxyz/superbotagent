// /modules/images/gantioutfit.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';
import FormData from 'form-data';

export const category = 'images';
export const description = 'Mengganti pakaian pada orang di foto berdasarkan teks.';
export const usage = `Kirim/reply gambar dengan caption *${BOT_PREFIX}gantioutfit [deskripsi pakaian]*\n\nContoh: *${BOT_PREFIX}gantioutfit kemeja batik*`;
export const aliases = ['changeclothes', 'dressup'];
export const energyCost = 12;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export default async function execute(sock, msg, args, text) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = quoted?.imageMessage || msg.message?.imageMessage;
    const prompt = text.trim();

    if (!imageMessage) {
        return await sock.sendMessage(sender, { text: `Mau gantiin bajunya siapa? Fotonya mana?` }, { quoted: msg });
    }
    if (!prompt) {
        return await sock.sendMessage(sender, { text: `Mau diganti jadi baju apa? Kasih tau dong deskripsinya.\nContoh: *.gantioutfit jas hitam formal*` }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `Sip! Lagi proses ganti baju jadi "${prompt}". Ditunggu ya... 👕✨` }, { quoted: msg });

        const stream = await downloadContentFromMessage(imageMessage, 'image');
        const buffer = await streamToBuffer(stream);

        const formData = new FormData();
        formData.append('image', buffer, 'image.jpg');
        formData.append('prompt', prompt);

        const apiUrl = 'https://szyrineapi.biz.id/api/images/pixnova/change-clothes';
        const response = await axios.post(apiUrl, formData, {
            headers: { ...formData.getHeaders() },
            responseType: 'arraybuffer',
            timeout: 120000
        });
        
        if (!response.data || response.data.length < 1000) {
            throw new Error("API gagal mengganti pakaian.");
        }
        
        const caption = `Tadaa! OOTD baru nih, cocok gak?\n\n${WATERMARK}`;
        await sock.sendMessage(sender, { image: response.data, caption: caption }, { quoted: msg });
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[GANTIOUTFIT ERROR]', error);
        let errorMessage = error.message;
        if (error.response?.data) {
           try { errorMessage = JSON.parse(error.response.data.toString()).message } catch {}
        }
        await sock.sendMessage(sender, { text: `Yah, gagal ganti baju 😭.\n*Alasan:* ${errorMessage}` }, { quoted: msg });
    }
}
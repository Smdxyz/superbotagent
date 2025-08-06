// /modules/images/aibaby.js

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';
import FormData from 'form-data';

export const category = 'images';
export const description = 'Memprediksi wajah bayi dari foto ayah dan ibu.';
export const usage = `Kirim foto "ibu" dengan caption *${BOT_PREFIX}aibaby [gender]* sambil me-reply foto "ayah".\n\nGender: 'boy' atau 'girl' (opsional).`;
export const aliases = ['prediksibayi'];
export const energyCost = 15;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export default async function execute(sock, msg, args) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const fatherImageMessage = quoted?.imageMessage; // Foto Ayah (di-reply)
    const motherImageMessage = msg.message?.imageMessage; // Foto Ibu (dikirim)

    if (!fatherImageMessage || !motherImageMessage) {
        return await sock.sendMessage(sender, { text: `Caranya salah, bestie. Reply foto "ayah", terus kirim foto "ibu" dengan caption *.aibaby*.` }, { quoted: msg });
    }

    let gender = args[0]?.toLowerCase() || (Math.random() < 0.5 ? 'boy' : 'girl'); // Random jika tidak diisi
    if (gender !== 'boy' && gender !== 'girl') {
        gender = 'boy'; // Default ke 'boy' jika input salah
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `Aww, so sweet! Lagi bikin prediksi bayi *${gender}* dari kedua foto ini... 👶` }, { quoted: msg });

        const [fatherStream, motherStream] = await Promise.all([
            downloadContentFromMessage(fatherImageMessage, 'image'),
            downloadContentFromMessage(motherImageMessage, 'image')
        ]);

        const [fatherBuffer, motherBuffer] = await Promise.all([
            streamToBuffer(fatherStream),
            streamToBuffer(motherStream)
        ]);
        
        const formData = new FormData();
        formData.append('father', fatherBuffer, 'father.jpg');
        formData.append('mother', motherBuffer, 'mother.jpg');
        formData.append('gender', gender);

        const apiUrl = 'https://szyrineapi.biz.id/api/images/pixnova/ai-baby';
        const response = await axios.post(apiUrl, formData, {
            headers: { ...formData.getHeaders() },
            responseType: 'arraybuffer',
            timeout: 120000
        });

        if (!response.data || response.data.length < 1000) {
            throw new Error("API-nya lagi nggak mau bikin bayi, coba lagi nanti.");
        }
        
        const caption = `Selamat! Ini dia prediksi wajah anak kalian nanti. Lucu kan?\n\n${WATERMARK}`;
        await sock.sendMessage(sender, { image: response.data, caption: caption }, { quoted: msg });
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[AIBABY ERROR]', error);
        let errorMessage = error.message;
        if (error.response?.data) {
           try { errorMessage = JSON.parse(error.response.data.toString()).message } catch {}
        }
        await sock.sendMessage(sender, { text: `Aduh, gagal bikin prediksi bayi 😭.\n*Alasan:* ${errorMessage}` }, { quoted: msg });
    }
}
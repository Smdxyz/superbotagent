// /core/handler.js (FINAL VERSION WITH INTELLIGENT MEDIA HANDLING)

import { BOT_MODE, BOT_OWNER } from '../config.js';
import { getOrCreateUserBasicData } from './firebase.js';
import { getUserLocalData, updateAffection, deductUserEnergy } from './localDataHandler.js';
import { callGeminiForAction } from './aira_gemini_brain.js';
import { executeCommand, getAllCommands } from './moduleRunner.js';
import { getWaitState, clearWaitState, setWaitState } from './waitStateHandler.js';
import { textToSpeech } from '../libs/apiClient.js';
import { createWithDeepImg } from '../modules/ai/deepimg.js';
import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';

const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 60;

export async function handler(sock, m) {
    if (!m || !m.messages || m.messages.length === 0) return;
    const msg = m.messages[0];
    if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const sender = msg.key.remoteJid;
    const senderNumber = sender.split('@')[0];
    if (BOT_MODE === 'private' && !BOT_OWNER.includes(senderNumber)) return;

    const pushName = msg.pushName || "Tuan";
    const messageContent = msg.message;
    const body = messageContent.conversation
                 || messageContent.extendedTextMessage?.text
                 || messageContent.imageMessage?.caption
                 || messageContent.videoMessage?.caption
                 || messageContent.buttonsResponseMessage?.selectedButtonId
                 || messageContent.listResponseMessage?.singleSelectReply?.selectedRowId
                 || '';
    const hasMediaInMainMessage = messageContent.imageMessage || messageContent.videoMessage;

    // --- LOGIKA CERDAS: ABAIKAN MEDIA TANPA KONTEKS ---
    // Jika ada gambar/video tapi tidak ada caption sama sekali, hentikan proses.
    if (hasMediaInMainMessage && !body.trim()) {
        console.log(`[HANDLER] Mengabaikan media dari ${sender} karena tidak ada caption/pertanyaan.`);
        return;
    }

    const waitState = getWaitState(sender);
    if (waitState && body) {
        try {
            await waitState.handler(sock, msg, body, waitState.context);
        } catch (error) {
            console.error(`[HANDLER_WAIT_STATE] Error saat menjalankan handler tunggu:`, error);
            await sock.sendMessage(sender, { text: `Aduh, ada error pas Aira proses balasanmu: ${error.message}` }, { quoted: msg });
        } finally {
            if (getWaitState(sender) === waitState) {
                clearWaitState(sender);
            }
        }
        return;
    }

    const { internalId } = await getOrCreateUserBasicData(sender, pushName);
    const userData = getUserLocalData(internalId, sender);
    if (userData.isMuted && Date.now() < userData.muteExpiresAt) return;

    const userHistory = conversationHistory.get(sender) || [];

    try {
        await sock.sendPresenceUpdate('composing', sender);

        // --- LOGIKA KONTEKS GAMBAR: Menyiapkan pesan multi-modal ---
        const messageParts = [{ text: body }];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Cek apakah pengguna me-reply sebuah gambar/video sambil bertanya.
        if (body && quoted && (quoted.imageMessage || quoted.videoMessage)) {
            console.log(`[HANDLER] Mendeteksi reply ke media. Menambahkan gambar ke konteks Gemini...`);
            try {
                const mediaType = quoted.imageMessage ? 'image' : 'video';
                const mediaMessage = quoted.imageMessage || quoted.videoMessage;
                
                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                // Tambahkan gambar ke 'parts' sebagai data base64 untuk dikirim ke Gemini.
                messageParts.push({
                    inlineData: {
                        mimeType: mediaMessage.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4'),
                        data: buffer.toString('base64')
                    }
                });
            } catch (downloadError) {
                console.warn(`[HANDLER] Gagal download media yang di-reply: ${downloadError.message}. Melanjutkan dengan teks saja.`);
            }
        }

        // Simpan giliran pengguna ke riwayat (bisa berisi teks + gambar).
        userHistory.push({ role: 'user', parts: messageParts });
        
        const decision = await callGeminiForAction(userHistory, pushName, userData.affection);
        
        if (!decision || typeof decision.action !== 'string') throw new Error("Respons Gemini tidak valid.");

        let botResponseText = '';

        switch (decision.action) {
            case 'chat':
            case 'clarification':
                botResponseText = decision.response;
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                if (decision.action === 'chat') updateAffection(internalId, 1, 'Happy');
                break;

            case 'send_vn':
                botResponseText = decision.parameters?.text || "Ini VN buat Tuan!";
                try {
                    await sock.sendMessage(sender, { text: `Oke, Aira rekam suara dulu ya... 🎙️` }, { quoted: msg });
                    const audioBuffer = await textToSpeech(decision.parameters.text, decision.parameters.lang || 'id');
                    await sock.sendMessage(sender, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                    updateAffection(internalId, 2, 'Happy');
                } catch (error) {
                    await sock.sendMessage(sender, { text: `Aduh, maaf, Tuan... pita suara Aira lagi serak 😥. Gagal bikin VN: ${error.message}` }, { quoted: msg });
                }
                break;

            case 'generate_and_send_image':
                const prompt = decision.parameters?.prompt;
                if (!prompt) {
                    await sock.sendMessage(sender, { text: "Aira mau gambar, tapi nggak tau mau gambar apa... 😥" }, { quoted: msg });
                    break;
                }
                try {
                    await sock.sendMessage(sender, { text: `Siap! Aira mulai gambar imajinasi Tuan: *"${prompt.substring(0, 50)}..."*. Ini butuh waktu sebentar yaa~ 🎨` }, { quoted: msg });
                    const imageUrl = await createWithDeepImg(prompt, 'anime', '1:1');
                    await sock.sendMessage(sender, { image: { url: imageUrl }, caption: `Ini dia hasil gambarnya, Tuan ${pushName}! Suka nggak?\n\n*Prompt Detail:* _${prompt}_` }, { quoted: msg });
                    updateAffection(internalId, 5, 'Happy');
                } catch (error) {
                    await sock.sendMessage(sender, { text: `Huaa, maaf... Kanvas Aira sobek 😭. Gagal gambar: ${error.message}` }, { quoted: msg });
                }
                break;

            case 'tool_use':
                const commandName = decision.tool;
                const command = getAllCommands().get(commandName);

                if (!command) {
                    botResponseText = `Duh, Aira pikir bisa, tapi perintah '${commandName}' nggak ada. 😥`;
                    await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                    break;
                }
                if (!deductUserEnergy(internalId, command.energyCost || 0)) {
                    botResponseText = `Tuan, energi Aira abis (butuh ${command.energyCost})... ⚡`;
                    await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                    break;
                }

                const parameters = decision.parameters || {};
                const args = Object.values(parameters);
                const text = args.join(' ');

                botResponseText = `Siap laksanakan, Tuan ${pushName}! Aira mulai kerjain perintah *${commandName}* ya. Tunggu sebentar! 😉`;
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });

                const extras = { set: setWaitState, clear: clearWaitState, originalMsg: msg };
                await executeCommand(commandName, sock, msg, args, text, sender, extras);

                updateAffection(internalId, 5, 'Happy');
                conversationHistory.delete(sender);
                return;

            default:
                botResponseText = decision.response || "Hmm, Aira agak bingung sama permintaan Tuan.";
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                break;
        }
        
        // --- MANAJEMEN MEMORI: Hanya menyimpan respons teks ke riwayat ---
        if (botResponseText) {
            userHistory.push({ role: 'model', parts: [{ text: botResponseText }] });
            if (userHistory.length > MAX_HISTORY_LENGTH) {
                userHistory.splice(0, userHistory.length - MAX_HISTORY_LENGTH);
            }
            conversationHistory.set(sender, userHistory);
        }

    } catch (error) {
        console.error(`[HANDLER_ERROR] Gagal total memproses pesan:`, error);
        await sock.sendMessage(sender, { text: "Huaaa... sistem utama Aira korslet! 😭" }, { quoted: msg });
    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}
// /core/handler.js (VERSI LENGKAP DENGAN AKSI VN & GAMBAR)

import { BOT_MODE, BOT_OWNER } from '../config.js';
import { getOrCreateUserBasicData } from './firebase.js';
import { getUserLocalData, updateAffection, deductUserEnergy } from './localDataHandler.js';
import { callGeminiForAction } from './aira_gemini_brain.js';
import { executeCommand, getAllCommands } from './moduleRunner.js';
import { getWaitState, clearWaitState, setWaitState } from './waitStateHandler.js';
import { textToSpeech } from '../libs/apiClient.js';
import { createWithDeepImg } from '../modules/ai/deepimg.js';

const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 60;

export async function handler(sock, m) {
    if (!m || !m.messages || m.messages.length === 0) return;
    const msg = m.messages[0];
    if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const sender = msg.key.remoteJid;
    const senderNumber = sender.split('@')[0];
    if (BOT_MODE === 'private' && !BOT_OWNER.includes(senderNumber)) {
        console.log(`[ACCESS DENIED] Pesan dari ${senderNumber} diabaikan karena bot dalam mode private.`);
        return;
    }

    const pushName = msg.pushName || "Tuan";
    const messageContent = msg.message;
    const body = messageContent.conversation
                 || messageContent.extendedTextMessage?.text
                 || messageContent.buttonsResponseMessage?.selectedButtonId
                 || messageContent.listResponseMessage?.singleSelectReply?.selectedRowId
                 || '';
    const hasMedia = messageContent.imageMessage || messageContent.videoMessage;

    const waitState = getWaitState(sender);
    if (waitState) {
        try {
            await waitState.handler(sock, msg, body, waitState.context);
        } catch (error) {
            await sock.sendMessage(sender, { text: `Aduh, ada error pas Aira proses balasanmu: ${error.message}` }, { quoted: msg });
        } finally {
            clearWaitState(sender);
        }
        return; 
    }

    const { internalId } = await getOrCreateUserBasicData(sender, pushName);
    const userData = getUserLocalData(internalId, sender);
    if (userData.isMuted && Date.now() < userData.muteExpiresAt) return;

    const userHistory = conversationHistory.get(sender) || [];
    if (!body && !hasMedia) return;

    try {
        await sock.sendPresenceUpdate('composing', sender);
        if (!body) return;

        userHistory.push({ role: 'user', parts: [{ text: body }] });
        const decision = await callGeminiForAction(userHistory, pushName, userData.affection);

        console.log(`[HANDLER_DEBUG] Keputusan dari Gemini:`, JSON.stringify(decision, null, 2));

        if (!decision || typeof decision.action !== 'string') {
            throw new Error("Respons dari Gemini tidak valid.");
        }

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
                    const audioBuffer = await textToSpeech(decision.parameters?.text, decision.parameters?.lang || 'id');
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
                    botResponseText = `Duh, Aira pikir bisa, tapi perintah '${commandName}' nggak ada. Aneh banget... 😥`;
                    await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                    break;
                }
                if (!deductUserEnergy(internalId, command.energyCost || 0)) {
                    botResponseText = `Tuan, energi Aira abis (butuh ${command.energyCost}). Istirahat dulu ya... ⚡`;
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

            case 'error':
                botResponseText = decision.response || "Duh, maaf... Aira lagi nge-lag 😥, coba tanya lagi deh.";
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                updateAffection(internalId, -5, 'Sad');
                break;

            default:
                botResponseText = decision.response || "Hmm, Aira agak bingung sama permintaan Tuan. Bisa coba dengan cara lain?";
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                break;
        }

        if (botResponseText) {
            userHistory.push({ role: 'model', parts: [{ text: botResponseText }] });
        }
        while (userHistory.length > MAX_HISTORY_LENGTH) {
            userHistory.shift();
        }
        conversationHistory.set(sender, userHistory);

    } catch (error) {
        console.error(`[HANDLER_ERROR] Gagal total memproses pesan untuk ${sender}:`, error);
        await sock.sendMessage(sender, { text: "Huaaa... sistem utama Aira korslet! 😭 Maaf ya, Tuan." }, { quoted: msg });
        updateAffection(internalId, -10, 'Sad');
    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}
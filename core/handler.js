// /core/handler.js (REVISED TO USE GPT-4 AND REMOVE VISION)

import { BOT_PREFIX, BOT_MODE, BOT_OWNER } from '../config.js';
import { getOrCreateUserBasicData } from './firebase.js';
import { getUserLocalData, updateAffection, deductUserEnergy } from './localDataHandler.js';
// --- PERUBAHAN: Import otak AI yang baru ---
import { callGpt4ForChat } from './aira_gpt4_brain.js'; 
import { executeCommand, getAllCommands } from './moduleRunner.js';
import { getWaitState, clearWaitState, setWaitState } from './waitStateHandler.js';

const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 12;

export async function handler(sock, m) {
    if (!m || !m.messages || m.messages.length === 0) return;
    const msg = m.messages[0];
    if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const sender = msg.key.remoteJid;
    const senderNumber = sender.split('@')[0];
    if (BOT_MODE === 'private' && !BOT_OWNER.includes(senderNumber)) return;

    const pushName = msg.pushName || "Tuan";
    const body = m.messages[0].message?.conversation
                 || m.messages[0].message?.extendedTextMessage?.text
                 || m.messages[0].message?.imageMessage?.caption
                 || m.messages[0].message?.buttonsResponseMessage?.selectedButtonId
                 || m.messages[0].message?.listResponseMessage?.singleSelectReply?.selectedRowId
                 || '';

    const { internalId } = await getOrCreateUserBasicData(sender, pushName);
    const userData = getUserLocalData(internalId, sender);
    if (userData.isMuted && Date.now() < userData.muteExpiresAt) return;

    // PRIORITAS #1: TANGANI WAITSTATE
    const waitState = getWaitState(sender);
    if (waitState && body) {
        try {
            await waitState.handler(sock, msg, body, waitState.context);
        } catch (error) {
            console.error(`[HANDLER_WAIT_STATE] Error:`, error);
            await sock.sendMessage(sender, { text: `Aduh, ada error: ${error.message}` }, { quoted: msg });
        } finally {
            if (getWaitState(sender) === waitState) clearWaitState(sender);
        }
        return;
    }

    // PRIORITAS #2: TANGANI PERINTAH EKSPLISIT
    if (body.startsWith(BOT_PREFIX)) {
        await sock.sendPresenceUpdate('composing', sender);
        const commandName = body.split(' ')[0].substring(BOT_PREFIX.length).toLowerCase();
        const args = body.split(' ').slice(1);
        const text = args.join(' ');
        const command = getAllCommands().get(commandName);

        if (command) {
            try {
                if (!deductUserEnergy(internalId, command.energyCost || 0)) {
                    return await sock.sendMessage(sender, { text: `Energi Aira abis (butuh ${command.energyCost})... ⚡` }, { quoted: msg });
                }
                const extras = { set: setWaitState, clear: clearWaitState, originalMsg: msg };
                await executeCommand(commandName, sock, msg, args, text, sender, extras);
                updateAffection(internalId, 3, 'Happy');
            } catch (cmdError) {
                console.error(`[HANDLER_COMMAND_ERROR] '${commandName}':`, cmdError);
                await sock.sendMessage(sender, { text: `Huaa, ada yang rusak pas Aira jalanin '${commandName}'. 😭` }, { quoted: msg });
            } finally {
                await sock.sendPresenceUpdate('paused', sender);
            }
        } else {
            await sock.sendMessage(sender, { text: `Duh, Aira nggak ngerti perintah '${commandName}'.` }, { quoted: msg });
            await sock.sendPresenceUpdate('paused', sender);
        }
        return;
    }

    // PRIORITAS #3: JIKA BUKAN PERINTAH, SERAHKAN KE AI UNTUK CHAT
    if (!body.trim()) return; // Abaikan pesan kosong

    try {
        await sock.sendPresenceUpdate('composing', sender);
        const userHistory = conversationHistory.get(sender) || [];

        // --- PENGHAPUSAN: Logika analisis gambar dihapus ---
        userHistory.push({ role: 'user', parts: [{ text: body }] });

        // --- PERUBAHAN: Memanggil otak GPT-4 ---
        const decision = await callGpt4ForChat(userHistory, pushName, sender);

        if (!decision || !decision.action) throw new Error("Respons AI tidak valid.");
        
        let botResponseText = decision.response;
        
        if (decision.action === 'error') {
            await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
        } else { // Asumsikan 'chat'
            await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
            updateAffection(internalId, 1, 'Happy');
            userHistory.push({ role: 'model', parts: [{ text: botResponseText }] });
            if (userHistory.length > MAX_HISTORY_LENGTH) {
                userHistory.splice(0, userHistory.length - MAX_HISTORY_LENGTH);
            }
            conversationHistory.set(sender, userHistory);
        }

    } catch (aiError) {
        console.error(`[HANDLER_AI_ERROR]`, aiError);
        await sock.sendMessage(sender, { text: "Huaaa... sistem utama Aira korslet! 😭" }, { quoted: msg });
    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}
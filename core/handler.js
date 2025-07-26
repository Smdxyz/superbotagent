// /core/handler.js (VERSI FINAL DENGAN WAIT STATE & FORMATBYTES)

import { getOrCreateUserBasicData } from './firebase.js';
import { getUserLocalData, updateAffection, deductUserEnergy } from './localDataHandler.js';
import { callGeminiForAction } from './aira_gemini_brain.js';
import { executeCommand, getAllCommands } from './moduleRunner.js';
import { getWaitState, clearWaitState } from './waitStateHandler.js';
import { uploadToSzyrine } from '../libs/apiUploader.js';
import { streamToBuffer } from '../libs/utils.js';
import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';

const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 8;

/**
 * Mengubah byte menjadi format yang mudah dibaca (KB, MB, GB).
 * @param {number} bytes - Jumlah byte.
 * @param {number} decimals - Jumlah angka desimal.
 * @returns {string} Ukuran file yang diformat.
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export async function handler(sock, m) {
    if (!m || !m.messages || m.messages.length === 0) return;
    const msg = m.messages[0];
    if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const sender = msg.key.remoteJid;
    const pushName = msg.pushName || "Tuan";
    const messageContent = msg.message;
    // Ekstrak isi pesan dari berbagai kemungkinan tipe balasan
    const body = messageContent.conversation
                 || messageContent.extendedTextMessage?.text
                 || messageContent.buttonsResponseMessage?.selectedButtonId
                 || messageContent.listResponseMessage?.singleSelectReply?.selectedRowId
                 || '';
    const hasMedia = messageContent.imageMessage || messageContent.videoMessage;

    // --- [LOGIKA WAIT STATE] ---
    // Cek apakah user ini sedang dalam status tunggu sebelum melakukan hal lain.
    const waitState = getWaitState(sender);
    if (waitState) {
        console.log(`[HANDLER] Menemukan wait state untuk ${sender}. Memproses balasan langsung...`);
        try {
            // Jalankan fungsi handler yang sudah didaftarkan oleh modul sebelumnya.
            await waitState.handler(sock, msg, body, waitState.context);
        } catch (error) {
            console.error(`[HANDLER_WAIT_STATE] Error saat menjalankan handler tunggu untuk ${sender}:`, error);
            await sock.sendMessage(sender, { text: `Aduh, ada error pas Aira proses balasanmu: ${error.message}` }, { quoted: msg });
        } finally {
            // Hapus state setelah selesai dieksekusi, baik berhasil maupun gagal.
            clearWaitState(sender);
        }
        return; // Hentikan eksekusi di sini, jangan teruskan ke AI.
    }
    // --- [AKHIR LOGIKA WAIT STATE] ---

    // Jika tidak ada wait state, lanjutkan alur normal...
    const { internalId } = await getOrCreateUserBasicData(sender, pushName);
    const userData = getUserLocalData(internalId, sender);
    if (userData.isMuted && Date.now() < userData.muteExpiresAt) return;

    const userHistory = conversationHistory.get(sender) || [];

    if (!body && !hasMedia) return;

    try {
        await sock.sendPresenceUpdate('composing', sender);
        let mediaUrl = null;
        if (hasMedia) {
            // Logika untuk mengunggah media jika ada
        }

        const fullUserPrompt = mediaUrl ? `${body} [Info Media: ${mediaUrl}]` : body;
        if (!fullUserPrompt) return;

        userHistory.push({ role: 'user', parts: [{ text: fullUserPrompt }] });

        const decision = await callGeminiForAction(userHistory, pushName, userData.affection);

        console.log(`[HANDLER_DEBUG] Keputusan mentah dari Gemini untuk ${sender}:`, JSON.stringify(decision, null, 2));

        if (!decision || typeof decision.action !== 'string') {
            console.error(`[HANDLER_FATAL] Respons dari Gemini tidak valid.`, decision);
            await sock.sendMessage(sender, { text: "Duh, Aira dapet balasan aneh dari pusat data, jadi bingung... Coba lagi deh, Tuan." }, { quoted: msg });
            return;
        }

        let botResponseText = '';

        switch (decision.action) {
            case 'chat':
            case 'clarification':
                botResponseText = decision.response;
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                if (decision.action === 'chat') updateAffection(internalId, 1, 'Happy');
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
                if (mediaUrl) parameters.media_url = mediaUrl;

                const args = Object.values(parameters);
                const text = args.join(' ');

                botResponseText = `Siap laksanakan, Tuan ${pushName}! Aira mulai kerjain perintah *${commandName}* ya. Tunggu sebentar! 😉`;
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });

                executeCommand(commandName, sock, msg, args, text, sender, {});

                updateAffection(internalId, 5, 'Happy');
                conversationHistory.delete(sender);
                return;

            case 'error':
                botResponseText = decision.response || "Duh, maaf... Aira lagi nge-lag 😥, coba tanya lagi deh.";
                await sock.sendMessage(sender, { text: botResponseText }, { quoted: msg });
                updateAffection(internalId, -5, 'Sad');
                break;

            default:
                console.warn(`[HANDLER_WARN] Menerima 'action' yang tidak dikenal: '${decision.action}'`);
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
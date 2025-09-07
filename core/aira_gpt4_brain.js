// /core/aira_gpt4_brain.js (NEW ADAPTER FOR GPT-4)

import { handleGpt4Response } from './gpt4Handler.js';

/**
 * Memanggil AI GPT-4 untuk mendapatkan respons chat.
 * @param {Array<object>} history - Riwayat percakapan.
 * @param {string} userName - Nama pengguna.
 * @param {string} jid - JID pengguna, digunakan sebagai sessionId.
 * @param {Array<string>} commandList - Daftar perintah yang bisa dijalankan Aira.
 * @returns {Promise<object>} Objek keputusan dengan format { action: 'chat', response: '...' }.
 */
export async function callGpt4ForChat(history, userName, jid, commandList = []) { // <-- TAMBAHAN: commandList
    const lastUserTurn = history.findLast(turn => turn.role === 'user');
    const lastUserMessage = lastUserTurn?.parts?.[0]?.text;

    if (!lastUserMessage) {
        return { action: 'chat', response: "Hmm? Tuan panggil Aira? 🤔" };
    }

    try {
        // Panggil handler GPT-4 dengan parameter tambahan
        const gptResponse = await handleGpt4Response(jid, userName, lastUserMessage, commandList); // <-- TAMBAHAN: commandList
        
        return {
            action: 'chat',
            response: gptResponse
        };

    } catch (error) {
        console.error("[GPT4_BRAIN_ERROR]", error);
        return {
            action: 'error',
            response: error.message || "Huaa... otak Aira lagi konslet nih, Tuan... 😭 Maafin Aira ya."
        };
    }
}
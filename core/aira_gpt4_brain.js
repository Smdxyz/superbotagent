// /core/aira_gpt4_brain.js (NEW ADAPTER FOR GPT-4)

import { handleGpt4Response } from './gpt4Handler.js';

/**
 * Memanggil AI GPT-4 untuk mendapatkan respons chat.
 * @param {Array<object>} history - Riwayat percakapan (meskipun tidak dipakai langsung oleh gpt4Handler).
 * @param {string} userName - Nama pengguna.
 * @param {string} jid - JID pengguna, digunakan sebagai sessionId.
 * @returns {Promise<object>} Objek keputusan dengan format { action: 'chat', response: '...' }.
 */
export async function callGpt4ForChat(history, userName, jid) {
    // Ekstrak pesan terakhir dari pengguna
    const lastUserTurn = history.findLast(turn => turn.role === 'user');
    const lastUserMessage = lastUserTurn?.parts?.[0]?.text;

    if (!lastUserMessage) {
        return { action: 'chat', response: "Hmm? Tuan panggil Aira? 🤔" };
    }

    try {
        // Panggil handler GPT-4 yang baru dengan sessionId (jid), nama user, dan pesannya
        const gptResponse = await handleGpt4Response(jid, userName, lastUserMessage);
        
        // Bungkus respons string ke dalam format JSON yang diharapkan oleh handler.js
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
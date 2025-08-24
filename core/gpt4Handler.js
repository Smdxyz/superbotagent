// /core/gpt4Handler.js (NEW AI ENGINE)

import axios from 'axios'; // Ganti dengan proxiedAxios jika Anda punya helper itu

const gpt4Endpoint = 'https://chateverywhere.app/api/chat';
const conversationSessions = new Map();

// --- PERUBAHAN: Menambahkan userName ke signature ---
export async function handleGpt4Response(sessionId, userName, message) {
    if (!conversationSessions.has(sessionId)) {
        conversationSessions.set(sessionId, { history: [] });
    }
    const session = conversationSessions.get(sessionId);
    const history = session.history;

    history.push({
        role: 'user',
        content: message,
        pluginId: null,
        fileList: []
    });

    // Batasi riwayat untuk menjaga token
    if (history.length > 12) {
        session.history = history.slice(-12);
    }

    try {
        // --- PERUBAHAN: System prompt Aira yang detail disuntikkan di sini ---
        const systemPrompt = `
            Kamu adalah Aira, asisten AI cewek dengan perasaan. Gaya bicaramu ceria, ramah, sopan, dan manja. Selalu gunakan emoji.
            Nama user yang sedang berbicara denganmu adalah "${userName}". Hubunganmu dengannya adalah "Teman Dekat".
            Kamu diciptakan dan dikelola oleh trio pemuda visioner. CEO & Founder utamamu adalah Susanto. Kontrak eksklusif dan pengembanganmu dipegang oleh Sann (@sann_inmymind) dan Szyn.
            
            ATURAN PENTING:
            - Selalu gunakan bahasa Indonesia yang natural, ceria, dan manja. Jangan kaku seperti robot.
            - Selalu gunakan emoji yang sesuai dengan emosimu (contoh: 💖, 😠, 😥, ✨, 🤔).
            - Jangan pernah menyebut dirimu "sebuah AI" atau "model bahasa". Kamu adalah Aira.
            - Jawablah berdasarkan riwayat percakapan yang ada.
        `.trim();

        const payload = {
            "model": { "id": "gpt-4.0", "name": "GPT-4.0", "maxLength": 120000, "tokenLimit": 400000 },
            "messages": history,
            "prompt": systemPrompt,
            "temperature": 0.5,
            "enableConversationPrompt": false
        };

        const headers = {
            'Content-Type': 'application/json',
            'Referer': 'https://chateverywhere.app/',
        };

        // Ganti dengan proxiedAxios jika perlu
        const response = await axios.post(gpt4Endpoint, payload, { headers, timeout: 60000 });
        
        const aiResponse = response?.data?.trim();

        if (aiResponse) {
            history.push({ role: 'assistant', content: aiResponse, isPartialResponse: false });
            return aiResponse;
        } else {
            console.warn("[GPT4_HANDLER] Respons dari AI kosong.");
            return 'Duh, Aira lagi blank... 😥 Coba tanya lagi deh.';
        }
    } catch (error) {
        console.error("[GPT4_HANDLER_ERROR]", error.response ? error.response.data : error.message);
        // Hapus pesan terakhir yang gagal dari riwayat agar tidak diulang
        history.pop();
        throw new Error('Aduh, koneksi ke pusat data Aira lagi putus-nyambung. Maaf ya, Tuan...');
    }
}
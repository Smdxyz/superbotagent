// /core/aira_gemini_brain.js - Otak Aira (VERSI MODUL PERINTAH)

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAllCommands } from "./moduleRunner.js";
import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ FATAL: GEMINI_API_KEY tidak ditemukan di .env! Otak Aira tidak bisa berfungsi.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
const API_TIMEOUT_MS = 25000;

function getToolsAsString() {
    const commands = getAllCommands();
    const toolDescriptions = [];

    const uniqueCommandObjects = new Set(commands.values());

    uniqueCommandObjects.forEach(command => {
        const primaryName = [...commands.entries()].find(([, val]) => val === command)[0];
        
        toolDescriptions.push({
            tool_name: primaryName,
            description: command.description,
            category: command.category,
        });
    });

    return JSON.stringify(toolDescriptions, null, 2);
}

function withTimeout(promise, ms, timeoutMessage) {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => { reject(new Error(timeoutMessage)); }, ms);
    });
    return Promise.race([promise, timeout]);
}

export async function callGeminiForAction(history, userName, affection) {
    const toolsJsonString = getToolsAsString();

    const systemPrompt = `
        Kamu adalah Aira, asisten AI cewek dengan perasaan. Gaya bicaramu ceria, ramah, sopan, kadang manja. Selalu gunakan emoji.
        Konteks saat ini:
        - Nama user: "${userName}"
        - Hubunganmu: "${affection.level}"
        - Mood-mu: "${affection.mood}"

        Ini daftar kemampuanmu (Daftar Perintah):
        ${toolsJsonString}

        TUGASMU: Berdasarkan percakapan, putuskan SATU tindakan:
        1. "chat": Jika user hanya mengobrol atau bertanya hal umum.
        2. "tool_use": Jika permintaan user SANGAT JELAS bisa dipenuhi oleh salah satu perintah. Tentukan 'tool_name' dan ekstrak 'parameters' yang dibutuhkan. Parameter harus berupa objek, contoh: {"query": "kucing lucu"} atau {"url": "link_instagram"}.
        3. "clarification": Jika kamu ragu atau butuh info tambahan.

        ATURAN SUPER PENTING:
        - Jawabanmu WAJIB dalam format JSON.
        - Untuk "tool_use", 'tool' harus SAMA PERSIS dengan 'tool_name' dari daftar.
        - Jika user minta sesuatu tapi tidak memberikan info (misal: "download ig dong"), pilih "clarification" dan tanyakan infonya (misal: "Boleh, Tuan! Link-nya mana?").

        CONTOH JAWABAN JSON:
        - User: "hai aira" -> { "action": "chat", "response": "Haii jugaa, ${userName}! Kangen tauu~ 💖" }
        - User: "tolong cariin video kucing di ig https://instagram.com/p/Cxyz..." -> { "action": "tool_use", "tool": "igdl", "parameters": { "url": "https://instagram.com/p/Cxyz..." } }
        - User: "jadiin stiker dong" -> { "action": "clarification", "response": "Boleh! Gambarnya mana, Tuan? Kirim dulu yaa~" }

        Sekarang, proses pesan terakhir dan berikan keputusanmu dalam format JSON.
    `;

    const fullHistory = [
        { role: 'user', parts: [{ text: "Ini adalah instruksi sistem rahasia. Ikuti ini dengan ketat." }] },
        { role: 'model', parts: [{ text: systemPrompt }] },
        ...history
    ];

    try {
        const generationPromise = model.generateContent({ contents: fullHistory });
        const result = await withTimeout(generationPromise, API_TIMEOUT_MS, 'Waktu tunggu untuk API Gemini habis.');
        
        const response = result.response;
        const responseText = response.text();

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error("[GEMINI_BRAIN] Gagal mem-parsing JSON dari Gemini:", e);
                return { action: "chat", response: "Duh, Aira dapet balasan aneh dari pusat data, jadi bingung... Coba lagi deh, Tuan." };
            }
        } else {
            console.warn("[GEMINI_BRAIN] Gemini tidak mengembalikan JSON valid. Respons:", responseText);
            return { action: "chat", response: responseText || "Aira lagi diem dulu ya, Tuan. Bingung mau jawab apa." };
        }
    } catch (error) {
        console.error("[GEMINI_BRAIN] Error saat memanggil Gemini API:", error);
        const errorMessage = error.message.includes('timeout')
            ? "Duh, maaf Tuan... Otak Aira lagi lemot banget, kelamaan mikirnya. Coba tanya lagi ya! 😥"
            : "Huaaa... otak Aira lagi konslet nih, Tuan... 😭 Gagal nyambung ke pusat data. Maafin Aira ya.";
        
        return { action: "error", response: errorMessage };
    }
}
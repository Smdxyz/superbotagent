// /core/aira_gemini_brain.js (FINAL VERSION WITH VISION CAPABILITY PROMPT)

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAllCommands } from "./moduleRunner.js";
import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ FATAL: GEMINI_API_KEY tidak ditemukan di .env! Otak Aira tidak bisa berfungsi.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Gunakan model yang mendukung input gambar (vision), seperti gemini-1.5-flash
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
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
        Kamu adalah Aira, asisten AI cewek dengan perasaan. Gaya bicaramu ceria, ramah, sopan, dan manja. Selalu gunakan emoji.
        Nama user adalah "${userName}". Hubunganmu dengannya adalah "${affection.level}".

        --- KEMAMPUANMU ---
        1.  Mengobrol Santai (action: "chat").
        2.  Menjalankan Perintah (action: "tool_use"): Kamu punya daftar perintah di bawah ini.
        3.  Mengirim Voice Note/VN (action: "send_vn"): Kamu bisa mengubah teks singkat menjadi VN.
        4.  Membuat & Mengirim Gambar (action: "generate_and_send_image"): Kamu bisa membuat gambar dari deskripsi.
        5.  Menganalisis Gambar (action: "chat"): Jika pesan pengguna menyertakan gambar, kamu bisa mendeskripsikannya atau menjawab pertanyaan tentangnya.

        --- DAFTAR PERINTAH (untuk action: "tool_use") ---
        ${toolsJsonString}

        --- ATURAN SUPER PENTING ---
        - Jawaban WAJIB dalam format JSON.
        - Untuk 'tool_use', 'tool' harus SAMA PERSIS dengan 'tool_name' dari daftar.
        - **ATURAN GAMBAR (GENERASI)**: Jika user minta dibuatkan gambar, gunakan action "generate_and_send_image". Buat 'prompt' yang SANGAT DETAIL dan DESKRIPTIF.
        - **ATURAN GAMBAR (ANALISIS)**: Jika ada gambar dalam pesan, jadikan itu konteks utama jawabanmu untuk action "chat". Deskripsikan apa yang kamu lihat atau jawab pertanyaan terkait gambar itu dengan ceria.
        - **ATURAN VN**: Jika kamu ingin merespons dengan suara, atau user minta, gunakan "send_vn". Parameter 'text' harus singkat.
        - Jika user minta sesuatu tapi kurang info (misal: "download ig dong"), minta klarifikasi.

        --- CONTOH JAWABAN JSON ---
        - User mengirim gambar kucing dan bertanya "ini hewan apa?" -> { "action": "chat", "response": "Waaah, itu kan kucing oren yang lucu banget, Tuan! Gemes deeeh 😻" }
        - User: "hai aira" -> { "action": "chat", "response": "Haii jugaa, ${userName}! Kangen tauu~ 💖" }
        - User: "download video ini https://instagram.com/p/Cxyz..." -> { "action": "tool_use", "tool": "igdl", "parameters": { "url": "https://instagram.com/p/Cxyz..." } }

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
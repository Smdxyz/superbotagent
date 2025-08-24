// /libs/apiClient.js (FILE BARU)

import axios from 'axios';

const API_TIMEOUT = 90000; // Timeout 90 detik

/**
 * Mengubah teks menjadi audio MP3 menggunakan API Szyrine.
 * @param {string} text Teks yang akan diubah menjadi suara.
 * @param {string} lang Kode bahasa (misal: 'id', 'en', 'ja').
 * @returns {Promise<Buffer>} Buffer audio dalam format MP3.
 */
export async function textToSpeech(text, lang = 'id') {
    try {
        const encodedText = encodeURIComponent(text);
        const apiUrl = `https://szyrineapi.biz.id/api/ai/tts?text=${encodedText}&lang=${lang}`;

        console.log(`[TTS_API] Memanggil API untuk teks: "${text.substring(0, 30)}..."`);

        const response = await axios.get(apiUrl, {
            responseType: 'arraybuffer', // Penting! API mengembalikan file audio langsung
            timeout: API_TIMEOUT
        });

        if (!response.data || response.data.length < 100) {
            throw new Error("API tidak mengembalikan data audio yang valid.");
        }

        return response.data; // Ini adalah Buffer
    } catch (error) {
        console.error("[TTS_API_ERROR]", error.message);
        throw new Error(`Gagal mengubah teks menjadi suara: ${error.message}`);
    }
}
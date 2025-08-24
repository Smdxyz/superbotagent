// /modules/downloaders/spodl.js (NEW MODULE FOR DIRECT DOWNLOADS)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import axios from 'axios';
import he from 'he';

export const category = 'downloaders';
export const description = 'Download lagu dari Spotify menggunakan link.';
export const usage = `${BOT_PREFIX}spodl <spotify_track_url>`;
export const aliases = ['spotifydl'];
export const requiredTier = 'Silver';
export const energyCost = 15;

// Helper function untuk memvalidasi URL Spotify
function isValidSpotifyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Regex untuk mencocokkan URL Spotify track yang valid
    const spotifyRegex = /^https?:\/\/(?:open|play)\.spotify\.com\/track\/[a-zA-Z0-9]+(?:\S+)?$/;
    return spotifyRegex.test(url);
}

// Fungsi ini mengambil URL unduhan dan judul lagu
// Menggunakan sistem fallback yang sama seperti playspo.js
async function getSpotifyTrackData(spotifyUrl) {
    // Upaya 1: API v2 (Cepat)
    try {
        const v2Endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify-v2?url=${encodeURIComponent(spotifyUrl)}`;
        const v2Res = await axios.get(v2Endpoint, { timeout: 45000 });
        const result = v2Res.data.result;
        if (result?.downloadUrl && result?.title) {
            console.log('[SPODL] Sukses mendapatkan data dari API v2.');
            return {
                title: he.decode(result.title),
                downloadUrl: result.downloadUrl
            };
        }
        throw new Error('API v2 tidak mengembalikan data yang valid.');
    } catch (v2Error) {
        console.warn(`[SPODL] API v2 gagal: ${v2Error.message}. Beralih ke API cadangan (v1)...`);
        
        // Upaya 2: API v1 (Cadangan)
        try {
            const v1Endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify?url=${encodeURIComponent(spotifyUrl)}`;
            const v1Res = await axios.get(v1Endpoint, { timeout: 120000 });
            const result = v1Res.data.result?.results || v1Res.data.result; // Menangani kedua kemungkinan format respons
            if (result?.downloadUrl && result?.title) {
                console.log('[SPODL] Sukses mendapatkan data dari API cadangan (v1).');
                return {
                    title: he.decode(result.title),
                    downloadUrl: result.downloadUrl
                };
            }
            throw new Error('API cadangan (v1) juga gagal mendapatkan data.');
        } catch (v1Error) {
            throw new Error(`Semua API (v2 dan v1) gagal mendapatkan data unduhan. Penyebab: ${v1Error.message}`);
        }
    }
}

export default async function execute(sock, msg, args, text, sender) {
    const spotifyUrl = text.trim();

    if (!isValidSpotifyUrl(spotifyUrl)) {
        return sock.sendMessage(sender, {
            text: `Link Spotify yang kamu kasih nggak valid, Tuan.\n\nPastikan formatnya seperti ini:\n*https://open.spotify.com/track/xxxxxxxxxxxx*`
        }, { quoted: msg });
    }

    let statusMsg;
    try {
        statusMsg = await sock.sendMessage(sender, { text: `✅ Link diterima! Aira lagi proses lagunya...` }, { quoted: msg });

        const trackData = await getSpotifyTrackData(spotifyUrl);
        
        await sock.sendMessage(sender, { text: `🎧 Lagu ditemukan: *${trackData.title}*\n\nSiap kirim...`, edit: statusMsg.key });

        await sock.sendMessage(sender, { 
            audio: { url: trackData.downloadUrl },
            mimetype: 'audio/mpeg', 
            fileName: `${trackData.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: trackData.title,
                    body: `Spotify Downloader | ${WATERMARK}`,
                    thumbnail: await getImageBuffer("https://i.ibb.co/L1L4p5W/szyrinethumb.jpg"), // Ganti dengan URL thumbnail default Anda
                    sourceUrl: spotifyUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (error) {
        console.error('[ERROR SPODL]', error);
        const errorMessage = `Waduh, gagal download lagunya 😵‍💫\n*Penyebab:* ${error.message}`;
        if (statusMsg) {
            await sock.sendMessage(sender, { text: errorMessage, edit: statusMsg.key });
        } else {
            await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
        }
    }
}
// /modules/downloaders/playspo.js (COMPLETE VERSION: 1 SEARCH API, 2 DOWNLOAD APIs w/ FALLBACK)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { sleep } from '../../libs/utils.js';
import axios from 'axios';
import he from 'he';

// API Pencarian (1)
async function searchSpotify(query) {
    try {
        const endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify/search?q=${encodeURIComponent(query)}&limit=5`;
        const res = await axios.get(endpoint);
        if (res.data?.status === 200 && Array.isArray(res.data.result) && res.data.result.length > 0) {
            return res.data.result.map(item => ({
                 ...item,
                 title: he.decode(item.title || 'Judul Tidak Diketahui'),
                 artists: he.decode(item.artists || 'Artis Tidak Diketahui'),
                 album: { ...item.album, name: he.decode(item.album?.name || 'Album Tidak Diketahui') }
            }));
        }
        return null;
    } catch (e) {
        throw new Error(`Gagal menghubungi server pencarian Spotify: ${e.message}`);
    }
}

// API Unduhan (2, dengan sistem fallback)
async function getSpotifyDownloadUrl(spotifyUrl) {
    // Upaya 1: Menggunakan API v2 (Cepat)
    try {
        console.log(`[SPO-DOWNLOAD] Mencoba API v2 untuk: ${spotifyUrl}`);
        const v2Endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify-v2?url=${encodeURIComponent(spotifyUrl)}`;
        const v2Res = await axios.get(v2Endpoint, { timeout: 45000 });
        if (v2Res.data?.result?.downloadUrl) {
            console.log('[SPO-DOWNLOAD] Sukses mendapatkan link dari API v2.');
            return v2Res.data.result.downloadUrl;
        }
        throw new Error('API v2 tidak mengembalikan downloadUrl.');
    } catch (v2Error) {
        console.warn(`[SPO-DOWNLOAD] API v2 gagal: ${v2Error.message}. Beralih ke API cadangan (v1)...`);
        
        // Upaya 2: Fallback ke API v1 (Lama/Stabil)
        try {
            const v1Endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify?url=${encodeURIComponent(spotifyUrl)}`;
            const v1Res = await axios.get(v1Endpoint, { timeout: 120000 });
            const url = v1Res.data.result?.downloadUrl || v1Res.data.result?.results?.downloadUrl;
            if (!url) throw new Error('API cadangan (v1) juga gagal mendapatkan downloadUrl.');
            console.log('[SPO-DOWNLOAD] Sukses mendapatkan link dari API cadangan (v1).');
            return url;
        } catch (v1Error) {
            throw new Error(`Semua API (v2 dan v1) gagal mendapatkan link download. Penyebab: ${v1Error.message}`);
        }
    }
}

export default async (sock, msg, args, text, sender, extras) => {
    if (!text) return sock.sendMessage(sender, { text: `Mau cari lagu apa dari Spotify?` }, { quoted: msg });

    let searchMsg;
    try {
        searchMsg = await sock.sendMessage(sender, { text: `Oke, gass! Nyari lagu *"${text}"* di Spotify... 🎵` }, { quoted: msg });
        const results = await searchSpotify(text);
        if (!results || results.length === 0) {
            return sock.sendMessage(sender, { text: `Yah, lagunya gak nemu di Spotify 😥. Coba judul lain.`, edit: searchMsg.key });
        }
        
        const songRows = results.map((song) => ({
            title: song.title,
            description: `Artis: ${song.artists} | Album: ${song.album.name}`,
            rowId: `spotify_dl_${song.url}`
        }));
        await sock.sendMessage(sender, {
            text: "Nih, dapet beberapa lagu. Pilih satu ya.",
            title: "🎶 Hasil Pencarian Spotify 🎶",
            buttonText: "PILIH LAGUNYA",
            sections: [{ title: "Pilih Lagu Dari Daftar:", rows: songRows }]
        });
        await sock.sendMessage(sender, { delete: searchMsg.key });

        const handleSpotifySelection = async (sock, msg, selectedId, context) => {
            const spotifyUrl = selectedId.replace('spotify_dl_', '');
            const selectedSong = context.searchResult.find(song => song.url === spotifyUrl);
            if (!selectedSong) return sock.sendMessage(sender, { text: `Waduh, pilihan lagunya aneh.` }, { quoted: msg });

            const waitingMsg = await sock.sendMessage(sender, { text: `Oke, pilihan diterima! Mulai proses download untuk:\n\n*${selectedSong.title}*...`}, { quoted: msg });
            
            try {
                const downloadUrl = await getSpotifyDownloadUrl(spotifyUrl);
                await sock.sendMessage(sender, { text: `✅ Link didapat! Siap kirim lagunya...`, edit: waitingMsg.key });

                const fullCaption = `
🎵 *Judul:* ${selectedSong.title}
🎤 *Artis:* ${selectedSong.artists}
💿 *Album:* ${selectedSong.album.name}
⏱️ *Durasi:* ${selectedSong.duration.formatted}
🗓️ *Rilis:* ${selectedSong.album.release_date || 'N/A'}

${WATERMARK}`.trim();

                await sock.sendMessage(sender, { 
                    image: { url: selectedSong.album.image_url },
                    caption: fullCaption 
                }, { quoted: msg });
                
                await sock.sendMessage(sender, { 
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg', 
                    fileName: `${selectedSong.title}.mp3` 
                }, { quoted: msg });

                await sock.sendMessage(sender, { delete: waitingMsg.key });
            } catch (err) {
                console.error('[ERROR SPOTIFY DOWNLOAD]', err);
                await sock.sendMessage(sender, { text: `Waduh, gagal proses lagunya 😵‍💫\n*Penyebab:* ${err.message}`, edit: waitingMsg.key });
            }
        };
        
        await extras.set(sender, 'playspo', {
            handler: handleSpotifySelection,
            context: { searchResult: results },
            timeout: 120000
        });
    } catch (err) {
        const targetKey = searchMsg ? { edit: searchMsg.key } : { quoted: msg };
        await sock.sendMessage(sender, { text: `❌ Gagal melakukan pencarian: ${err.message}` }, targetKey);
    }
};

export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari Spotify lengkap dengan gambar album.';
export const usage = `${BOT_PREFIX}playspo <judul lagu>`;
export const requiredTier = 'Silver';
export const energyCost = 20;
// /modules/downloaders/playspo.js (FINAL VERSION)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { sleep, getImageBuffer } from '../../libs/utils.js';
import axios from 'axios';
import he from 'he';

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
        console.error(`[SPO-SEARCH] Gagal mencari lagu Spotify "${query}":`, e.message);
        throw new Error('Gagal menghubungi server pencarian Spotify.');
    }
}

async function downloadSpotifyToBuffer(spotifyUrl) {
    let directDownloadUrl;
    try {
        const apiEndpoint = `https://szyrineapi.biz.id/api/downloaders/spotify?url=${encodeURIComponent(spotifyUrl)}`;
        const apiRes = await axios.get(apiEndpoint, { timeout: 120000 });
        const rawData = apiRes.data;
        
        directDownloadUrl = rawData.result?.downloadUrl || rawData.result?.results?.downloadUrl;

        if (!directDownloadUrl) {
            throw new Error('API tidak mengembalikan `downloadUrl` yang valid.');
        }
    } catch (e) {
        throw new Error(`Gagal mendapatkan link download dari server: ${e.message}`);
    }

    let lastDownloadError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const audioRes = await axios.get(directDownloadUrl, { responseType: 'arraybuffer', timeout: 180000 });
            const audioBuffer = Buffer.from(audioRes.data);
            if (audioBuffer.length < 10240) throw new Error(`File audio rusak atau terlalu kecil.`);
            
            return audioBuffer;
        } catch (e) {
            lastDownloadError = e;
            if (attempt < 3) await sleep(3000);
        }
    }
    
    throw new Error(`Gagal mengunduh file audio setelah 3 percobaan. Penyebab: ${lastDownloadError.message}`);
}

export default async (sock, msg, args, text, sender, extras) => {
    if (!text) {
        return sock.sendMessage(sender, { text: `Mau cari lagu apa dari Spotify?\n\nContoh: *${BOT_PREFIX}playspo JKT48 Seventeen*` }, { quoted: msg });
    }

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

        const listMessage = {
            text: "Nih, dapet beberapa lagu dari Spotify. Pilih satu ya.",
            title: "🎶 Hasil Pencarian Spotify 🎶",
            buttonText: "PILIH LAGUNYA",
            sections: [{ title: "Pilih Lagu Dari Daftar:", rows: songRows }]
        };
        
        await sock.sendMessage(sender, listMessage);
        await sock.sendMessage(sender, { delete: searchMsg.key });

        const handleSpotifySelection = async (sock, msg, selectedId, context) => {
            const spotifyUrl = selectedId.replace('spotify_dl_', '');
            // Mengambil data lagu dari context yang disimpan
            const selectedSong = context.searchResult.find(song => song.url === spotifyUrl);

            if (!selectedSong) {
                return sock.sendMessage(sender, { text: `Waduh, pilihan lagunya aneh. Coba ulang dari awal.` }, { quoted: msg });
            }

            const waitingMsg = await sock.sendMessage(sender, { text: `Oke, pilihan diterima! Mulai proses download untuk:\n\n*${selectedSong.title}*...`}, { quoted: msg });
            const waitingKey = waitingMsg.key;

            try {
                const audioBuffer = await downloadSpotifyToBuffer(spotifyUrl);
                await sock.sendMessage(sender, { text: `✅ Download selesai! Siap kirim...`, edit: waitingKey });

                const fullCaption = `
🎵 *Judul:* ${selectedSong.title}
🎤 *Artis:* ${selectedSong.artists}
💿 *Album:* ${selectedSong.album.name}
⏱️ *Durasi:* ${selectedSong.duration.formatted}
🗓️ *Rilis:* ${selectedSong.album.release_date || 'N/A'}

${WATERMARK}`.trim();

                const thumbnailBuffer = await getImageBuffer(selectedSong.album?.image_url);

                await sock.sendMessage(sender, { 
                    image: thumbnailBuffer || undefined,
                    caption: fullCaption 
                }, { quoted: msg });
                
                await sock.sendMessage(sender, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mpeg', 
                    fileName: `${selectedSong.title}.mp3` 
                }, { quoted: msg });

                await sock.sendMessage(sender, { delete: waitingKey });

            } catch (err) {
                console.error('[ERROR SPOTIFY DOWNLOAD]', err);
                const errorMessage = `Waduh, gagal proses lagunya 😵‍💫\n*Penyebab:* ${err.message}`;
                await sock.sendMessage(sender, { text: errorMessage, edit: waitingKey });
            }
        };
        
        await extras.set(sender, 'playspo', {
            handler: handleSpotifySelection,
            context: { searchResult: results }, // Menyimpan hasil pencarian
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
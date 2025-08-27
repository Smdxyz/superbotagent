// /modules/downloaders/pinterest.js (FIXED ID PARSING LOGIC)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { getImageBuffer } from '../../libs/utils.js';

export const category = 'downloaders';
export const description = 'Mencari gambar dari Pinterest dengan berbagai mode & tampilan.';
export const usage = `${BOT_PREFIX}pinterest <query>`;
export const aliases = ['pin'];
export const energyCost = 4;

// Fungsi ini tidak berubah, sudah benar.
async function fetchPinterestData(query, apiMode, limit) {
    let apiUrl;
    switch (apiMode) {
        case 'v1_fast':
            apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search?q=${encodeURIComponent(query)}&count=${limit}`;
            const resultV1 = await safeApiGet(apiUrl);
            if (!resultV1 || !Array.isArray(resultV1)) throw new Error("API Pencarian Cepat (v1) gagal.");
            return resultV1.map(url => ({ imageUrl: url, title: query, sourceUrl: url }));
        
        case 'v2_detail':
            apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search-v2?q=${encodeURIComponent(query)}&count=${limit}`;
            const resultV2 = await safeApiGet(apiUrl);
            const pinsV2 = resultV2?.result?.pins;
            if (!pinsV2 || !Array.isArray(pinsV2)) throw new Error("API Pencarian Detail (v2) gagal.");
            return pinsV2.map(pin => ({
                imageUrl: pin.media?.images?.orig?.url,
                title: pin.title || pin.description || query,
                sourceUrl: `https://id.pinterest.com/pin/${pin.id}/`
            }));

        case 'v3_best':
            apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search-v3?q=${encodeURIComponent(query)}&limit=${limit}`;
            const resultV3 = await safeApiGet(apiUrl);
            if (!resultV3 || !Array.isArray(resultV3)) throw new Error("API Pencarian Terbaik (v3) gagal.");
            return resultV3.map(pin => ({
                imageUrl: pin.imageLink,
                title: pin.title || query,
                sourceUrl: pin.pinterestLink
            }));
        
        default:
            throw new Error("Mode API tidak valid.");
    }
}

// Fungsi lain tidak berubah
async function sendAsAlbum(sock, msg, pins, query) { /* ... (kode sama) ... */ }
async function sendAsCarousel(sock, msg, pins, query) { /* ... (kode sama) ... */ }


// --- FUNGSI INILAH YANG DIPERBAIKI ---
async function handleSearchSelection(sock, msg, selectedId, context) {
    const { query, statusMsgKey } = context;
    const sender = msg.key.remoteJid;

    // --- PERBAIKAN UTAMA ADA DI SINI ---
    const parts = selectedId.split('_');
    const limit = parseInt(parts.pop(), 10); // Ambil bagian terakhir sebagai 'limit'
    const displayMode = parts.pop(); // Ambil bagian kedua dari belakang sebagai 'displayMode'
    const apiMode = parts.join('_'); // Gabungkan sisa bagian depan sebagai 'apiMode'
    // Contoh: "v3_best_carousel_10" -> apiMode="v3_best", displayMode="carousel", limit=10
    // --- AKHIR DARI PERBAIKAN ---

    try {
        await sock.sendMessage(sender, { text: `🔎 Oke, mode dipilih! Mencari *${limit}* gambar untuk *"${query}"*...`, edit: statusMsgKey });
        
        // Sekarang, variabel 'apiMode' akan berisi nilai yang benar ('v3_best', 'v1_fast', dll.)
        const pins = (await fetchPinterestData(query, apiMode, limit)).filter(p => p.imageUrl);

        if (pins.length === 0) throw new Error("Tidak ada gambar yang ditemukan.");

        await sock.sendMessage(sender, { text: `✅ Nemu *${pins.length}* gambar! Menyiapkan tampilan *${displayMode}*...`, edit: statusMsgKey });
        
        if (displayMode === 'album') {
            await sendAsAlbum(sock, msg, pins, query);
        } else { // carousel
            await sendAsCarousel(sock, msg, pins, query);
        }

        await sock.sendMessage(sender, { delete: statusMsgKey });
    } catch (error) {
        console.error("[PINTEREST_HANDLER_ERROR]", error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pas nyari: ${error.message}`, edit: statusMsgKey });
    }
}

// Fungsi execute tidak berubah
export default async function execute(sock, msg, args, text, sender, extras) { /* ... (kode sama) ... */ }


// --- KODE LENGKAP FUNGSI YANG TIDAK DIUBAH (UNTUK KEMUDAHAN COPY-PASTE) ---

async function sendAsAlbum(sock, msg, pins, query) {
    const albumItems = [];
    for (const pin of pins.slice(0, 10)) { // Batas album 10
        try {
            const buffer = await getImageBuffer(pin.imageUrl);
            if (buffer) {
                const caption = albumItems.length === 0 ? `🖼️ Ini dia album untuk: *"${query}"*` : '';
                albumItems.push({ image: buffer, caption });
            }
        } catch (e) {
            console.warn(`[PINTEREST_ALBUM] Gagal unduh: ${pin.imageUrl}`);
        }
    }
    if (albumItems.length === 0) throw new Error("Gagal mengunduh semua gambar untuk album.");
    await sock.sendAlbumMessage(msg.key.remoteJid, albumItems, { quoted: msg });
}

async function sendAsCarousel(sock, msg, pins, query) {
    const carouselCards = [];
    for (const pin of pins.slice(0, 10)) { // Batas carousel 10
        if (!pin.imageUrl || !pin.sourceUrl) continue;
        carouselCards.push({
            header: { hasMediaAttachment: true, imageMessage: { url: pin.imageUrl } },
            body: { text: `*${pin.title}*` },
            nativeFlowMessage: {
                buttons: [{
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({ display_text: "Lihat di Pinterest", url: pin.sourceUrl })
                }]
            }
        });
    }
    if (carouselCards.length === 0) throw new Error("Tidak ada gambar yang valid untuk dibuat Carousel.");
    await sock.sendMessage(msg.key.remoteJid, {
        interactive: {
            type: 'carousel',
            header: { title: `🖼️ Hasil untuk: ${query}` },
            body: { text: `Berikut adalah ${carouselCards.length} gambar yang Aira temukan.` },
            carousel: { cards: carouselCards }
        }
    }, { quoted: msg });
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const query = text.trim();
    if (!query) return sock.sendMessage(sender, { text: `Mau cari gambar apa di Pinterest?` }, { quoted: msg });

    try {
        const statusMsg = await sock.sendMessage(sender, { text: `▶️ Siap-siap nyari *"${query}"*...` }, { quoted: msg });

        const listRows = [
            { title: "Carousel (Kualitas Terbaik)", description: "10 gambar, tampilan interaktif, data paling akurat.", rowId: "v3_best_carousel_10" },
            { title: "Album (Kualitas Terbaik)", description: "10 gambar, tampilan galeri, data paling akurat.", rowId: "v3_best_album_10" },
            { title: "Album (Pencarian Cepat)", description: "10 gambar, hasil instan, kualitas standar.", rowId: "v1_fast_album_10" },
            { title: "Album (Pencarian Detail)", description: "5 gambar, alternatif jika v3 gagal.", rowId: "v2_detail_album_5" },
        ];
        
        await sock.sendMessage(sender, {
            text: `Mau pake mode pencarian & tampilan yang mana nih?`,
            footer: "Pilih salah satu dari opsi di bawah ini.",
            title: "🔎 Mode Pencarian Pinterest 🔎",
            buttonText: "Pilih Mode",
            sections: [{ title: "Opsi Pencarian & Tampilan", rows: listRows }]
        }, { quoted: msg });

        await extras.set(sender, 'pinterest', {
            handler: handleSearchSelection,
            context: { query, statusMsgKey: statusMsg.key },
            timeout: 120000 
        });
    } catch (error) {
        console.error("[PINTEREST_EXEC_ERROR]", error);
        await sock.sendMessage(sender, { text: `❌ Gagal memulai perintah Pinterest: ${error.message}` }, { quoted: msg });
    }
}
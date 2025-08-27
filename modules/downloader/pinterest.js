// /modules/downloaders/pinterest.js (FINAL & FIXED VERSION 4)

import { generateWAMessageContent } from '@fizzxydev/baileys-pro';
import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { getImageBuffer } from '../../libs/utils.js';

// --- Metadata Perintah ---
export const category = 'downloaders';
export const description = 'Mencari gambar dari Pinterest dengan berbagai mode & tampilan.';
export const usage = `${BOT_PREFIX}pinterest <query>`;
export const aliases = ['pin'];
export const energyCost = 4;

// --- Konstanta & Konfigurasi ---
const MAX_ALBUM_ITEMS = 10;
const MAX_CAROUSEL_CARDS = 10;

/**
 * Mengambil data dari berbagai endpoint API Pinterest.
 */
async function fetchPinterestData(query, apiMode, limit) {
    let apiUrl;
    const encodedQuery = encodeURIComponent(query);

    switch (apiMode) {
        case 'v1_fast':
            apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search?q=${encodedQuery}&count=${limit}`;
            const responseV1 = await safeApiGet(apiUrl);
            if (!responseV1 || !Array.isArray(responseV1)) {
                throw new Error("API Pencarian Cepat (v1) tidak memberikan hasil yang valid.");
            }
            return responseV1.map(url => ({ imageUrl: url, title: query, sourceUrl: url }));

        case 'v2_detail':
            apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search-v2?q=${encodedQuery}&count=${limit}`;
            const responseV2 = await safeApiGet(apiUrl);
            const pinsV2 = responseV2?.result?.pins;
            if (!pinsV2 || !Array.isArray(pinsV2)) {
                throw new Error("API Pencarian Detail (v2) tidak memberikan hasil yang valid.");
            }
            return pinsV2.map(pin => ({
                imageUrl: pin.media?.images?.orig?.url,
                title: pin.title || pin.description || query,
                sourceUrl: `https://id.pinterest.com/pin/${pin.id}/`
            }));

        case 'v3_best':
            apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search-v3?q=${encodedQuery}&limit=${limit}`;
            const responseV3 = await safeApiGet(apiUrl);
            if (!responseV3 || !Array.isArray(responseV3)) {
                throw new Error("API Pencarian Terbaik (v3) tidak memberikan hasil yang valid.");
            }
            return responseV3.map(pin => ({
                imageUrl: pin.imageLink,
                title: pin.title || query,
                sourceUrl: pin.pinterestLink
            }));

        default:
            throw new Error(`Mode API tidak valid: ${apiMode}`);
    }
}

/**
 * Mengirimkan hasil pencarian sebagai album/galeri.
 */
async function sendAsAlbum(sock, msg, pins, query) {
    const albumItems = [];
    for (const pin of pins.slice(0, MAX_ALBUM_ITEMS)) {
        try {
            const buffer = await getImageBuffer(pin.imageUrl);
            if (buffer) {
                const caption = albumItems.length === 0 ? `🖼️ Ini dia album untuk: *"${query}"*` : '';
                albumItems.push({ image: buffer, caption });
            }
        } catch (e) {
            console.warn(`[PINTEREST_ALBUM] Gagal mengunduh gambar: ${pin.imageUrl}`, e);
        }
    }

    if (albumItems.length === 0) {
        throw new Error("Gagal mengunduh semua gambar untuk album.");
    }
    await sock.sendAlbumMessage(msg.key.remoteJid, albumItems, { quoted: msg });
}

/**
 * Mengirimkan hasil pencarian sebagai pesan carousel interaktif.
 */
async function sendAsCarousel(sock, msg, pins, query) {
    const carouselCards = [];
    for (const pin of pins.slice(0, MAX_CAROUSEL_CARDS)) {
        if (!pin.imageUrl || !pin.sourceUrl) continue;

        try {
            const buffer = await getImageBuffer(pin.imageUrl);
            if (!buffer) {
                console.warn(`[PINTEREST_CAROUSEL] Gagal unduh buffer untuk: ${pin.imageUrl}`);
                continue;
            }

            // --- PERBAIKAN FINAL: Berikan fungsi upload dari sock ke dalam options ---
            const mediaMessage = await generateWAMessageContent(
                { image: buffer },
                { upload: sock.waUploadToServer } // Ini adalah bagian kuncinya
            );
            // --- AKHIR PERBAIKAN ---

            const buttonParams = {
                display_text: "Lihat di Pinterest",
                url: pin.sourceUrl
            };

            carouselCards.push({
                header: { hasMediaAttachment: true, ...mediaMessage },
                body: { text: `*${pin.title}*` },
                nativeFlowMessage: {
                    buttons: [{
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify(buttonParams)
                    }]
                }
            });
        } catch (e) {
            console.warn(`[PINTEREST_CAROUSEL] Gagal memproses kartu untuk: ${pin.imageUrl}`, e);
        }
    }

    if (carouselCards.length === 0) {
        throw new Error("Tidak ada gambar yang valid untuk dibuat Carousel.");
    }

    const interactiveMessage = {
        interactive: {
            type: 'carousel',
            header: { title: `🖼️ Hasil Pencarian untuk: ${query}` },
            body: { text: `Berikut adalah ${carouselCards.length} gambar yang ditemukan.` },
            carousel: { cards: carouselCards }
        }
    };

    await sock.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg });
}

/**
 * Menangani logika setelah pengguna memilih mode dari daftar.
 */
async function handleSearchSelection(sock, msg, selectedId, context) {
    const { query, statusMsgKey } = context;
    const sender = msg.key.remoteJid;

    const parts = selectedId.split('_');
    const limitStr = parts.pop();
    const displayMode = parts.pop();
    const apiMode = parts.join('_');
    const limit = parseInt(limitStr, 10);

    try {
        await sock.sendMessage(sender, { text: `🔎 Oke, mode dipilih! Mencari *${limit}* gambar untuk *"${query}"*...`, edit: statusMsgKey });

        const pins = (await fetchPinterestData(query, apiMode, limit)).filter(p => p.imageUrl);

        if (pins.length === 0) {
            throw new Error(`Tidak ada gambar yang ditemukan untuk query: "${query}"`);
        }

        await sock.sendMessage(sender, { text: `✅ Ditemukan *${pins.length}* gambar! Menyiapkan tampilan *${displayMode}*...`, edit: statusMsgKey });

        if (displayMode === 'album') {
            await sendAsAlbum(sock, msg, pins, query);
        } else {
            await sendAsCarousel(sock, msg, pins, query);
        }

        await sock.sendMessage(sender, { delete: statusMsgKey });
    } catch (error) {
        console.error("[PINTEREST_HANDLER_ERROR]", error);
        await sock.sendMessage(sender, { text: `❌ Aduh, terjadi kesalahan: ${error.message}`, edit: statusMsgKey });
    }
}

/**
 * Fungsi eksekusi utama untuk perintah !pinterest.
 */
export default async function execute(sock, msg, args, text, sender, extras) {
    const query = text.trim();
    if (!query) {
        return sock.sendMessage(sender, { text: `Silakan masukkan kata kunci untuk mencari gambar di Pinterest.\nContoh: *${BOT_PREFIX}pinterest anime aesthetic*` }, { quoted: msg });
    }

    try {
        const statusMsg = await sock.sendMessage(sender, { text: `▶️ Mempersiapkan mode pencarian untuk *"${query}"*...` }, { quoted: msg });

        const listRows = [
            { title: "Carousel (Kualitas Terbaik)", description: "10 gambar, tampilan interaktif, data akurat.", rowId: "v3_best_carousel_10" },
            { title: "Album (Kualitas Terbaik)", description: "10 gambar, tampilan galeri, data akurat.", rowId: "v3_best_album_10" },
            { title: "Album (Pencarian Cepat)", description: "10 gambar, hasil instan, kualitas standar.", rowId: "v1_fast_album_10" },
            { title: "Album (Pencarian Detail)", description: "5 gambar, alternatif jika API lain gagal.", rowId: "v2_detail_album_5" },
        ];
        
        const listMessage = {
            text: `Mau pakai mode pencarian & tampilan yang mana untuk *"${query}"*?`,
            footer: "Pilih salah satu dari opsi di bawah ini.",
            title: "🔎 Mode Pencarian Pinterest 🔎",
            buttonText: "Pilih Mode",
            sections: [{ title: "Opsi Pencarian & Tampilan", rows: listRows }]
        };

        await sock.sendMessage(sender, listMessage, { quoted: msg });

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
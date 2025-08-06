import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { getImageBuffer } from '../../libs/utils.js';

export const category = 'downloaders';
export const description = 'Mencari gambar dari Pinterest.';
export const usage = `${BOT_PREFIX}pinterest <query>`;
export const aliases = ['pin'];
export const energyCost = 2;

async function fetchPinterestData(query, mode = 'simple_search') {
    const count = mode.includes('10') ? 10 : (mode.includes('5') ? 5 : 10);
    const apiToUse = mode.startsWith('v2') ? 'search-v2' : 'search';
    const apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/${apiToUse}?q=${encodeURIComponent(query)}&count=${count}`;
    
    const result = await safeApiGet(apiUrl);
    let pins = [];

    if (apiToUse === 'search') {
        if (!result || !Array.isArray(result)) throw new Error("API Pencarian Cepat gagal.");
        pins = result.map(url => ({ imageUrl: url, title: query }));
    } else {
        const pinData = result?.result?.pins;
        if (!pinData || !Array.isArray(pinData)) throw new Error("API Pencarian Detail gagal.");
        pins = pinData.map(pin => ({
            imageUrl: pin.media?.images?.orig?.url,
            title: pin.title || pin.description || query,
        }));
    }

    pins = pins.filter(p => p.imageUrl);
    if (pins.length === 0) throw new Error("Tidak ada gambar yang ditemukan.");
    return pins;
}

async function sendAsAlbum(sock, msg, pins, query) {
    const albumItems = [];
    for (const pin of pins.slice(0, 10)) {
        const buffer = await getImageBuffer(pin.imageUrl);
        if (buffer) {
            const caption = albumItems.length === 0 ? `🖼️ Ini dia album untuk: *"${query}"*` : '';
            albumItems.push({ image: buffer, caption });
        }
    }
    if (albumItems.length === 0) throw new Error("Gagal mengunduh semua gambar untuk album.");
    await sock.sendAlbumMessage(msg.key.remoteJid, albumItems, { quoted: msg });
}

async function handleSearchModeSelection(sock, msg, selectedMode, context) {
    const { query, statusMsgKey } = context.data;
    const sender = msg.key.remoteJid;

    try {
        await sock.sendMessage(sender, { text: `🔎 Oke, mode dipilih! Mencari *"${query}"* di Pinterest...`, edit: statusMsgKey });
        const pins = await fetchPinterestData(query, selectedMode);
        
        await sock.sendMessage(sender, { text: `✅ Berhasil! Nemu *${pins.length}* gambar. Mengirim sebagai album galeri...`, edit: statusMsgKey });
        await sendAsAlbum(sock, msg, pins, query);

        await sock.sendMessage(sender, { delete: statusMsgKey });
    } catch (error) {
        console.error("[PINTEREST_HANDLER_ERROR]", error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pas nyari: ${error.message}`, edit: statusMsgKey });
    }
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const query = text.trim();
    if (!query) {
        return sock.sendMessage(sender, { text: `Mau cari gambar apa di Pinterest?` }, { quoted: msg });
    }

    try {
        const statusMsg = await sock.sendMessage(sender, { text: `▶️ Oke, siap-siap nyari *"${query}"*...` }, { quoted: msg });

        const listRows = [
            { title: "Pencarian Cepat", description: "Hasil instan, hingga 10 gambar.", rowId: "simple_search" },
            { title: "Pencarian Detail (5)", description: "5 gambar dengan kualitas terbaik.", rowId: "v2_search_5" },
            { title: "Pencarian Detail (10)", description: "10 gambar dengan kualitas terbaik.", rowId: "v2_search_10" },
        ];
        
        await sock.sendMessage(sender, {
            text: `Mau pake mode pencarian yang mana nih?`,
            footer: "Bot akan mulai mencari setelah kamu memilih.",
            title: "🔎 Mode Pencarian Pinterest 🔎",
            buttonText: "Pilih Mode",
            sections: [{ title: "Opsi Pencarian", rows: listRows }]
        }, { quoted: msg });

        await extras.set(sender, 'pinterest', handleSearchModeSelection, {
            data: { query, statusMsgKey: statusMsg.key },
            timeout: 120000
        });

    } catch (error) {
        console.error("[PINTEREST_EXEC_ERROR]", error);
        await sock.sendMessage(sender, { text: `❌ Gagal memulai perintah Pinterest: ${error.message}` }, { quoted: msg });
    }
}
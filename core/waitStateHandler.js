// /core/waitStateHandler.js - Manajer Status Tunggu

const waitStates = new Map();

/**
 * Mendaftarkan seorang user ke dalam status tunggu untuk balasan.
 * @param {string} jid - JID user yang ditunggu.
 * @param {Function} handler - Fungsi yang akan dieksekusi saat user membalas. Fungsi ini menerima (sock, msg, body, context).
 * @param {number} [timeout=60000] - Waktu dalam milidetik sebelum state dihapus otomatis (default: 1 menit).
 * @param {object} [context={}] - Data tambahan yang mungkin dibutuhkan oleh fungsi handler.
 */
export function setWaitState(jid, handler, timeout = 60000, context = {}) {
    // Hapus state lama jika ada, untuk menghindari konflik
    if (waitStates.has(jid)) {
        clearTimeout(waitStates.get(jid).timeoutId);
    }

    const timeoutId = setTimeout(() => {
        console.log(`[WAIT_STATE] State untuk ${jid} telah kedaluwarsa.`);
        waitStates.delete(jid);
    }, timeout);

    waitStates.set(jid, { handler, context, timeoutId });
    console.log(`[WAIT_STATE] User ${jid} sekarang dalam status tunggu selama ${timeout / 1000} detik.`);
}

/**
 * Mengambil state tunggu seorang user.
 * @param {string} jid - JID user.
 * @returns {object | undefined} Objek state jika ada, jika tidak undefined.
 */
export function getWaitState(jid) {
    return waitStates.get(jid);
}

/**
 * Menghapus state tunggu seorang user secara manual.
 * @param {string} jid - JID user.
 */
export function clearWaitState(jid) {
    if (waitStates.has(jid)) {
        clearTimeout(waitStates.get(jid).timeoutId);
        waitStates.delete(jid);
        console.log(`[WAIT_STATE] State untuk ${jid} telah dibersihkan.`);
    }
}
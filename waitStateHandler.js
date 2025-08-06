// /core/waitStateHandler.js (REWRITTEN FOR ROBUSTNESS)

const waitStates = new Map();

/**
 * Mendaftarkan user ke dalam status tunggu dengan menggunakan satu objek konfigurasi.
 * @param {string} jid - JID user yang ditunggu.
 * @param {string} command - Nama perintah yang menunggu (untuk debugging).
 * @param {object} options - Opsi untuk state.
 * @param {Function} options.handler - Fungsi yang akan dieksekusi saat user membalas.
 * @param {object} [options.context={}] - Data tambahan yang dibutuhkan oleh handler.
 * @param {number} [options.timeout=60000] - Waktu dalam milidetik sebelum state kedaluwarsa.
 */
export function setWaitState(jid, command, options = {}) {
    const { handler, context = {}, timeout = 60000 } = options;

    if (typeof handler !== 'function') {
        console.error(`[WAIT_STATE_ERROR] Gagal set state untuk '${command}' karena handler bukan fungsi.`);
        return;
    }

    // Hapus state lama jika ada untuk menghindari konflik
    if (waitStates.has(jid)) {
        clearTimeout(waitStates.get(jid).timeoutId);
    }

    const timeoutId = setTimeout(() => {
        console.log(`[WAIT_STATE] State '${command}' untuk ${jid} telah kedaluwarsa.`);
        waitStates.delete(jid);
    }, timeout);

    waitStates.set(jid, { command, handler, context, timeoutId });
    console.log(`[WAIT_STATE] User ${jid} sekarang dalam status tunggu untuk '${command}' selama ${timeout / 1000} detik.`);
}

/**
 * Mengambil state tunggu seorang user.
 * @param {string} jid - JID user.
 * @returns {object | undefined} Objek state jika ada.
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
        const { command, timeoutId } = waitStates.get(jid);
        clearTimeout(timeoutId);
        waitStates.delete(jid);
        console.log(`[WAIT_STATE] State '${command}' untuk ${jid} telah dibersihkan.`);
    }
}
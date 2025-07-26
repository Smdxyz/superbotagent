// /libs/utils.js - Kumpulan "Perkakas" Serbaguna untuk Aira

import axios from 'axios';

/**
 * Mengubah data Stream menjadi Buffer. Sangat berguna untuk menangani
 * unduhan file dari Baileys atau sumber lainnya.
 * @param {ReadableStream} stream - Stream data yang akan diubah.
 * @returns {Promise<Buffer>} Buffer dari data stream.
 */
export async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

/**
 * Mengunduh konten dari sebuah URL dan mengembalikannya sebagai Buffer.
 * Berguna untuk mengambil gambar/video sebelum diolah atau dikirim.
 * @param {string} url - URL dari konten yang akan diunduh.
 * @returns {Promise<Buffer|null>} Buffer dari konten atau null jika gagal.
 */
export async function getImageBuffer(url) {
    if (!url) return null;
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        console.error(`[UTILS] Gagal mengunduh buffer dari URL: ${url}`, error.message);
        return null;
    }
}

/**
 * Membuat jeda (delay) dalam eksekusi kode.
 * @param {number} ms - Waktu jeda dalam milidetik.
 * @example await sleep(2000); // Berhenti selama 2 detik
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Memilih satu item secara acak dari sebuah array.
 * @param {Array<T>} array - Array yang akan dipilih itemnya.
 * @returns {T} Satu item acak dari array.
 */
export function getRandomItem(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Memformat ukuran byte menjadi format yang lebih mudah dibaca (KB, MB, GB).
 * @param {number} bytes - Ukuran dalam byte.
 * @param {number} [decimals=2] - Jumlah angka di belakang koma.
 * @returns {string} String ukuran yang sudah diformat.
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Mengecek apakah sebuah string adalah URL yang valid.
 * @param {string} string - String yang akan divalidasi.
 * @returns {boolean} True jika valid, false jika tidak.
 */
export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Mengambil ekstensi file dari sebuah URL atau path.
 * @param {string} url - URL atau path file.
 * @returns {string} Ekstensi file dalam huruf kecil (misal: 'jpg', 'mp4').
 */
export function getFileExtension(url) {
    if (!url) return '';
    try {
        const path = new URL(url).pathname;
        const extension = path.split('.').pop();
        return extension ? extension.toLowerCase() : '';
    } catch (error) {
        // Fallback untuk path lokal
        const extension = url.split('.').pop();
        return extension ? extension.toLowerCase() : '';
    }
}
// main.js (VERSI UPGRADE DENGAN MODULE RUNNER)

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@fizzxydev/baileys-pro';

import { bot } from './core/bott.js';
import { createBotConnection } from './core/connection.js'; 
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/moduleRunner.js';

const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

process.on('SIGINT', () => {
    console.log('\n[MAIN] Sinyal SIGINT diterima. Memaksa keluar...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('\n[MAIN] Sinyal SIGTERM diterima. Memaksa keluar...');
    process.exit(0);
});

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
};

async function checkDependencies() {
    console.log("🔍 [CHECK] Memeriksa dependensi eksternal...");
    try {
        await commandExists('ffmpeg');
        console.log("✅ [OK] FFmpeg ditemukan.");
    } catch (e) {
        console.error("❌ [FATAL] FFmpeg tidak ditemukan. Silakan install FFmpeg.", e.message);
        process.exit(1);
    }
}

async function runBot() {
    console.log("[MAIN] Memulai koneksi bot...");
    const authFolderPath = path.resolve('session');
    const sessionExists = fs.existsSync(authFolderPath);
    let loginMode = null;

    if (!sessionExists) {
        console.log("[AUTH] Folder sesi tidak ditemukan.");
        const choice = await question("Pilih Mode Pairing: [1] Otomatis | [2] Manual: ");
        if (choice === '1') loginMode = 'auto';
        else if (choice === '2') loginMode = 'manual';
        else {
            console.log("Pilihan tidak valid, keluar.");
            process.exit(1);
        }
    }

    const sock = await createBotConnection(loginMode);
    
    bot.sock = sock;

    console.log("[MAIN] Memasang event handler untuk pesan dan panggilan...");
    bot.sock.ev.on('messages.upsert', (m) => handler(bot.sock, m));
    bot.sock.ev.on('call', (calls) => handleIncomingCall(bot.sock, calls));
    
    bot.sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 500;
            
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[MAIN] Koneksi terputus, mencoba menyambung kembali dalam 10 detik...");
                setTimeout(runBot, 10000);
            } else {
                console.error("❌ [FATAL] Logged Out. Hapus folder 'session' dan restart untuk pairing ulang.");
                fs.rmSync(path.resolve('session'), { recursive: true, force: true });
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log("✅ [MAIN] Koneksi berhasil tersambung!");
        }
    });
    
    console.log("✅ [MAIN] Bot siap menerima perintah!");
    console.log("--- BOT FULLY OPERATIONAL ---");
}

async function main() {
    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot - Aira Agent...");
        console.log("\n--- TAHAP 1: PERSIAPAN INTERNAL ---");
        await checkDependencies();
        
        await loadCommands(); 
        
        console.log("[MAIN] Persiapan internal selesai.\n");
        
        console.log("--- TAHAP 2: KONEKSI KE WHATSAPP ---");
        await runBot();

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

main();
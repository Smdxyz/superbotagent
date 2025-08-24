// /core/moduleRunner.js (VERSI FINAL YANG LEBIH BERSIH)

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modulesDir = path.join(__dirname, '../modules');
const commandMap = new Map();

export async function loadCommands() {
    console.log('🔍 [MODULE RUNNER] Memuat semua modul perintah...');
    commandMap.clear();

    try {
        const categoryDirs = await fs.readdir(modulesDir, { withFileTypes: true });

        for (const category of categoryDirs) {
            if (!category.isDirectory()) continue;

            const categoryPath = path.join(modulesDir, category.name);
            const commandFiles = (await fs.readdir(categoryPath)).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandName = path.basename(file, '.js');

                try {
                    const commandModule = await import(`file://${filePath}?t=${Date.now()}`);

                    if (commandModule.default && typeof commandModule.default === 'function') {
                        const commandData = {
                            execute: commandModule.default,
                            description: commandModule.description || 'Tidak ada deskripsi.',
                            category: commandModule.category || category.name,
                            aliases: commandModule.aliases || [],
                            energyCost: commandModule.energyCost || 0,
                        };

                        commandMap.set(commandName, commandData);
                        commandData.aliases.forEach(alias => commandMap.set(alias, commandData));
                    }
                } catch (error) {
                    console.error(`❌ Gagal memuat perintah '${commandName}':`, error);
                }
            }
        }
    } catch (error) {
        console.error("❌ Error besar saat memindai folder modul:", error);
    }

    console.log(`[MODULE RUNNER] ✅ Pemuatan selesai. Total ${commandMap.size} perintah & alias dimuat.`);
}

export async function executeCommand(commandName, sock, msg, args, text, sender, extras = {}) {
    const command = commandMap.get(commandName);
    if (!command) {
        console.warn(`[MODULE RUNNER] Perintah '${commandName}' tidak ditemukan.`);
        await sock.sendMessage(sender, { text: `Duh, Aira nggak ngerti perintah '${commandName}'. 😥` });
        return;
    }

    try {
        console.log(`[MODULE RUNNER] Mengeksekusi perintah '${commandName}' untuk ${sender}...`);

        // Langsung mengeksekusi perintah dengan objek 'extras' yang sudah lengkap dari handler.js
        await command.execute(sock, msg, args, text, sender, extras);

    } catch (error) {
        console.error(`[MODULE RUNNER] Error saat menjalankan '${commandName}':`, error);
        await sock.sendMessage(sender, { text: `Waduh, ada yang rusak pas Aira coba jalanin perintah itu... Maaf ya, Tuan. 😭` });
    }
}

export function getAllCommands() {
    return commandMap;
}
// /core/localDataHandler.js (VERSI DIPERBAIKI DENGAN ATOMIC WRITE)
// Mengelola semua data lokal pengguna dengan sistem cache performa tinggi.
// Termasuk data persona Aira (Hati, Mood, Hubungan).

import fs from 'fs';
import path from 'path';
import {
    LOCAL_DATA_DIR,
    TIERS,
    INITIAL_ENERGY,
    ENERGY_RECHARGE_RATE_PER_HOUR,
    MAX_ENERGY_BY_TIER,
    BOT_OWNER,
    SPAM_WINDOW_SECONDS
} from '../config.js';

// --- SISTEM HUBUNGAN ---
export const RELATIONSHIP_LEVELS = {
    Stranger:     { threshold: 0,    name: 'Orang Asing' },
    Acquaintance: { threshold: 100,  name: 'Kenalan' },
    Friend:       { threshold: 500,  name: 'Teman' },
    Bestie:       { threshold: 1500, name: 'Sahabat' },
    Lover:        { threshold: 3000, name: 'Kekasih' },
    Wife:         { threshold: 5000, name: 'Istri' }
};

// --- INISIALISASI ---
const dataDirPath = path.resolve(LOCAL_DATA_DIR);
if (!fs.existsSync(dataDirPath)) { fs.mkdirSync(dataDirPath, { recursive: true }); }
const toxicWordsFilePath = path.resolve('./toxicWords.json');

// --- CACHE & PERSISTENCE ---
let cachedToxicWords = null;
const localUserDataCache = new Map();
const dirtyUsers = new Set();
const SAVE_INTERVAL_MS = 5 * 60 * 1000;

// --- STRUKTUR DATA DEFAULT ---
const defaultLocalUserData = {
    messageCount: 0,
    lastMessageTimestamp: 0,
    spamTracker: { timestamps: [] },
    toxicStrikes: 0,
    isMuted: false,
    muteExpiresAt: 0,
    tier: 'Basic',
    energy: INITIAL_ENERGY,
    lastEnergyRechargeTimestamp: Date.now(),
    rejectedCalls: 0,
    trial: { tier: null, expiresAt: 0 },
    redeemedCodes: [],
    affection: {
        level: 'Stranger',
        heartPoints: 0,
        mood: 'Normal'
    }
};

// --- FUNGSI INTI (CACHE & I/O) ---

function loadUserToCache(internalId, jid = '') {
    const filePath = path.join(dataDirPath, `${internalId}.json`);
    let userData;
    try {
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            // [FIX] Cek jika file kosong sebelum parsing
            if (rawData.trim() === '') {
                throw new Error("File is empty");
            }
            const dataFromFile = JSON.parse(rawData);
            const affectionData = { ...defaultLocalUserData.affection, ...dataFromFile.affection };
            userData = { ...defaultLocalUserData, ...dataFromFile, affection: affectionData };
        } else {
            userData = JSON.parse(JSON.stringify(defaultLocalUserData));
            if (jid && BOT_OWNER.includes(jid.split('@')[0])) {
                userData.tier = 'Admin';
                userData.energy = MAX_ENERGY_BY_TIER['Admin'];
                userData.affection.level = 'Wife';
                userData.affection.heartPoints = 99999;
                userData.affection.mood = 'Manja';
            }
            dirtyUsers.add(internalId);
        }
    } catch (error) {
        console.error(`[LOCAL DATA] Gagal membaca file untuk ${internalId}, menggunakan data default. Error:`, error);
        userData = JSON.parse(JSON.stringify(defaultLocalUserData));
        dirtyUsers.add(internalId);
    }
    localUserDataCache.set(internalId, userData);
    return userData;
}

export function getUserLocalData(internalId, jid = '') {
    if (localUserDataCache.has(internalId)) {
        return localUserDataCache.get(internalId);
    }
    return loadUserToCache(internalId, jid);
}

export function updateUserLocalData(internalId, data) {
    localUserDataCache.set(internalId, data);
    dirtyUsers.add(internalId);
}

async function saveDirtyDataToFile() {
    if (dirtyUsers.size === 0) return;
    console.log(`[LOCAL DATA] Menyimpan perubahan untuk ${dirtyUsers.size} user...`);
    const usersToSave = Array.from(dirtyUsers);
    dirtyUsers.clear();

    for (const internalId of usersToSave) {
        if (localUserDataCache.has(internalId)) {
            const userData = localUserDataCache.get(internalId);
            const finalPath = path.join(dataDirPath, `${internalId}.json`);
            const tempPath = `${finalPath}.tmp`; // [FIX] Path untuk file sementara

            try {
                // [FIX] Tulis ke file sementara terlebih dahulu
                await fs.promises.writeFile(tempPath, JSON.stringify(userData, null, 2), 'utf-8');
                // [FIX] Jika berhasil, ganti nama file sementara menjadi file final (atomic operation)
                await fs.promises.rename(tempPath, finalPath);
            } catch (error) {
                console.error(`❌ Gagal menulis data lokal untuk ${internalId}:`, error);
                dirtyUsers.add(internalId); // Jika gagal, coba lagi di siklus berikutnya
                // Hapus file sementara jika ada
                if (fs.existsSync(tempPath)) {
                    await fs.promises.unlink(tempPath);
                }
            }
        }
    }
}

setInterval(saveDirtyDataToFile, SAVE_INTERVAL_MS);
process.on('exit', saveDirtyDataToFile);

// --- FUNGSI UTILITAS PENGGUNA (TETAP SAMA) ---
// ... (Semua fungsi lain dari rechargeUserEnergy sampai checkTrialExpiration tidak perlu diubah) ...
export function rechargeUserEnergy(internalId) {
    const userData = getUserLocalData(internalId);
    const now = Date.now();
    const lastRecharge = userData.lastEnergyRechargeTimestamp || now;
    const hoursPassed = (now - lastRecharge) / (1000 * 60 * 60);
    if (hoursPassed > 0) {
        const maxEnergy = MAX_ENERGY_BY_TIER[userData.tier] || MAX_ENERGY_BY_TIER['Basic'];
        if (userData.energy < maxEnergy) {
            const energyToAdd = Math.floor(hoursPassed * ENERGY_RECHARGE_RATE_PER_HOUR);
            if (energyToAdd > 0) {
                userData.energy = Math.min(maxEnergy, userData.energy + energyToAdd);
                userData.lastEnergyRechargeTimestamp = now;
                updateUserLocalData(internalId, userData);
            }
        }
    }
    return getUserLocalData(internalId);
}

export function deductUserEnergy(internalId, amount) {
    const userData = getUserLocalData(internalId);
    if (userData.tier === 'Admin') return true;
    if (userData.energy >= amount) {
        userData.energy -= amount;
        updateUserLocalData(internalId, userData);
        return true;
    }
    return false;
}

export function updateUserMessageStatsLocal(internalId, messageTimestamp) {
    const userData = getUserLocalData(internalId);
    userData.messageCount = (userData.messageCount || 0) + 1;
    userData.lastMessageTimestamp = messageTimestamp;
    const spamWindowMs = SPAM_WINDOW_SECONDS * 1000;
    userData.spamTracker.timestamps = (userData.spamTracker?.timestamps || []).filter(ts => messageTimestamp - ts < spamWindowMs);
    userData.spamTracker.timestamps.push(messageTimestamp);
    updateUserLocalData(internalId, userData);
    return userData;
}

export function incrementRejectedCallsLocal(internalId) {
    const userData = getUserLocalData(internalId);
    userData.rejectedCalls = (userData.rejectedCalls || 0) + 1;
    updateUserLocalData(internalId, userData);
}

export function updateAffection(internalId, pointsToAdd = 0, newMood = null) {
    const userData = getUserLocalData(internalId);
    if (!userData.affection) {
        userData.affection = JSON.parse(JSON.stringify(defaultLocalUserData.affection));
    }
    const affection = userData.affection;

    affection.heartPoints += pointsToAdd;
    if (affection.heartPoints < 0) affection.heartPoints = 0;

    if (userData.tier !== 'Admin') {
        let currentLevel = 'Stranger';
        for (const levelName in RELATIONSHIP_LEVELS) {
            if (affection.heartPoints >= RELATIONSHIP_LEVELS[levelName].threshold) {
                currentLevel = levelName;
            }
        }
        if (currentLevel !== affection.level) {
            console.log(`[AFECTION] Hubungan dengan ${internalId} naik level menjadi: ${currentLevel}!`);
            affection.level = currentLevel;
        }
    }

    if (newMood) affection.mood = newMood;

    updateUserLocalData(internalId, userData);
    return affection;
}

function loadToxicWords() {
    if (cachedToxicWords) return cachedToxicWords;
    try {
        if (fs.existsSync(toxicWordsFilePath)) {
            const rawData = fs.readFileSync(toxicWordsFilePath, 'utf-8');
            cachedToxicWords = JSON.parse(rawData);
            return cachedToxicWords;
        }
        return [];
    } catch (error) {
        console.error("[LOCAL DATA] Gagal memuat file toxicWords.json:", error);
        return [];
    }
}

export function incrementToxicStrikeLocal(internalId) {
    const userData = getUserLocalData(internalId);
    userData.toxicStrikes = (userData.toxicStrikes || 0) + 1;
    updateUserLocalData(internalId, userData);
    return userData.toxicStrikes;
}

export function setUserMuteLocal(internalId, durationSeconds) {
    const userData = getUserLocalData(internalId);
    userData.isMuted = true;
    userData.muteExpiresAt = Date.now() + (durationSeconds * 1000);
    updateUserLocalData(internalId, userData);
}

export function clearUserMuteLocal(internalId) {
    const userData = getUserLocalData(internalId);
    userData.isMuted = false;
    userData.muteExpiresAt = 0;
    updateUserLocalData(internalId, userData);
}

export function checkMessageForToxicWords(internalId, text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { strikeAdded: false, newStrikeCount: getUserLocalData(internalId).toxicStrikes, foundWords: [] };
    }
    const toxicWordsList = loadToxicWords();
    if (toxicWordsList.length === 0) return { strikeAdded: false, newStrikeCount: getUserLocalData(internalId).toxicStrikes, foundWords: [] };
    
    const wordsInMessage = text.toLowerCase().match(/\b(\w+)\b/g) || [];
    const foundToxicWords = wordsInMessage.filter(word => toxicWordsList.includes(word));

    if (foundToxicWords.length > 0) {
        const newStrikeCount = incrementToxicStrikeLocal(internalId);
        return { strikeAdded: true, newStrikeCount: newStrikeCount, foundWords: foundToxicWords };
    }
    return { strikeAdded: false, newStrikeCount: getUserLocalData(internalId).toxicStrikes, foundWords: [] };
}

export async function checkTrialExpiration(sock, internalId, jid) {
    const userData = getUserLocalData(internalId, jid);
    if (userData.trial && userData.trial.expiresAt > 0) {
        if (Date.now() > userData.trial.expiresAt) {
            const expiredTier = userData.trial.tier;
            console.log(`[TRIAL] Trial ${expiredTier} untuk user ${internalId} telah berakhir.`);
            userData.tier = 'Basic';
            userData.trial.tier = null;
            userData.trial.expiresAt = 0;
            updateUserLocalData(internalId, userData);
            try {
                await sock.sendMessage(jid, { text: `Waktu habis! ⏰\n\nMasa trial untuk tier *${expiredTier}* Anda telah berakhir. Tier Anda telah kembali ke *Basic*.` });
            } catch (e) {
                console.error(`[TRIAL] Gagal mengirim notifikasi trial berakhir ke ${jid}:`, e);
            }
            return true;
        }
    }
    return false;
}
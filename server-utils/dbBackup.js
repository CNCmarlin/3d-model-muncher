const fs = require('fs');
const path = require('path');

// Maximum number of rolling backups to keep
const MAX_BACKUPS = 5;
// Cooldown parameter (e.g. 10 minutes: 10 * 60 * 1000)
const DEBOUNCE_MS = 10 * 60 * 1000;

let lastBackupTime = 0;

/**
 * Executes a rolling backup of the target database file.
 * Creates safeRestore.bak.1, safeRestore.bak.2, safeRestore.bak.3 where .1 is the newest.
 *
 * @param {string} dbPath - Absolute path to the database (e.g., ./dev.db)
 * @param {string} triggerReason - String indicating why this was called (e.g., "deleteMany Model")
 */
function performDbBackup(dbPath, triggerReason = "Manual") {
    // 1. Debounce check
    const now = Date.now();
    if (now - lastBackupTime < DEBOUNCE_MS) {
        console.log(`⏳ [DB Auto-Backup] Skipped: Cooldown active (last backup was ${(now - lastBackupTime) / 1000}s ago). Trigger: ${triggerReason}`);
        return;
    }

    // 2. File verification
    if (!fs.existsSync(dbPath)) {
        console.error(`❌ [DB Auto-Backup] Target DB not found: ${dbPath}`);
        return;
    }

    try {
        console.log(`💾 [DB Auto-Backup] Starting rolling backup... Trigger: ${triggerReason}`);

        const backupDir = path.dirname(dbPath);

        // 3. Rolling rotation (Delete oldest, shift others down)
        // Example: .bak.3 is deleted. .bak.2 -> .bak.3. .bak.1 -> .bak.2.
        for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
            const currentBackup = path.join(backupDir, `safeRestore.bak.${i}`);
            const nextBackup = path.join(backupDir, `safeRestore.bak.${i + 1}`);

            if (fs.existsSync(currentBackup)) {
                fs.copyFileSync(currentBackup, nextBackup);
            }
        }

        // 4. Create new primary backup (.bak.1)
        const primaryBackup = path.join(backupDir, `safeRestore.bak.1`);
        // We write to a temporary file first, then atomically rename to prevent corruption if interrupted
        const tempBackup = path.join(backupDir, `safeRestore.bak.tmp`);
        fs.copyFileSync(dbPath, tempBackup);
        fs.renameSync(tempBackup, primaryBackup);

        // Update the timestamp on success
        lastBackupTime = Date.now();
        console.log(`✅ [DB Auto-Backup] Backup complete -> ${path.basename(primaryBackup)}`);

    } catch (e) {
        console.error("❌ [DB Auto-Backup] Error during backup:", e);
    }
}

module.exports = {
    performDbBackup
};

const zlib = require('zlib');
const { createBackup, restoreBackup } = require('../../server-utils/backupService');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');

class BackupControllerDB {

    // POST /api/backup-munchie-files
    async createBackup(req, res) {
        try {
            const modelsDir = getAbsoluteModelsPath();
            const { compressed, filename, count } = await createBackup(modelsDir);

            res.setHeader('Content-Type', 'application/gzip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', compressed.length);
            res.send(compressed);

            console.log(`Backup created: ${count} files, ${(compressed.length / 1024).toFixed(2)} KB`);
        } catch (error) {
            console.error('Backup creation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST /api/restore-munchie-files
    async restoreBackup(req, res) {
        try {
            const { backupData, strategy = 'hash-match', collectionsStrategy = 'merge' } = req.body;
            if (!backupData) return res.status(400).json({ success: false, error: 'No backup data provided' });

            const modelsDir = getAbsoluteModelsPath();
            // backupData is already parsed or string? Service handles string parsing check? 
            // Service expects string or object. 
            const results = await restoreBackup(backupData, modelsDir, strategy, collectionsStrategy);

            res.json({ success: true, ...results, summary: `Restored ${results.restored.length}, skipped ${results.skipped.length}, errors ${results.errors.length}` });
        } catch (error) {
            console.error('Restore error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST /api/restore-munchie-files/upload
    async restoreBackupUpload(req, res) {
        try {
            if (!req.file) return res.status(400).json({ success: false, error: 'No backup file provided' });
            const { strategy = 'hash-match', collectionsStrategy = 'merge' } = req.body;

            let backupData;
            if (req.file.originalname.endsWith('.gz')) {
                try {
                    const decompressed = zlib.gunzipSync(req.file.buffer);
                    backupData = decompressed.toString('utf8');
                } catch (error) { return res.status(400).json({ success: false, error: 'Failed to decompress backup file' }); }
            } else {
                backupData = req.file.buffer.toString('utf8');
            }

            const modelsDir = getAbsoluteModelsPath();
            const results = await restoreBackup(backupData, modelsDir, strategy, collectionsStrategy);

            res.json({ success: true, ...results });
        } catch (error) {
            console.error('File upload restore error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new BackupControllerDB();

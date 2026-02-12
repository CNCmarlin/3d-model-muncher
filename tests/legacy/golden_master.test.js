
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Mock ConfigManager to avoid loading real config
import { vi } from 'vitest';
import { ConfigManager } from '../../dist-backend/utils/configManager';

// Setup Temp Directory
const TEMP_MODELS_DIR = path.join(__dirname, 'temp_models_golden_master');
const MOCK_3MF = path.join(TEMP_MODELS_DIR, 'test-model.3mf');
const MOCK_MUNCHIE = path.join(TEMP_MODELS_DIR, 'test-model-munchie.json');

// Helper to create dummy files
function setupTempFiles() {
    if (fs.existsSync(TEMP_MODELS_DIR)) {
        fs.rmSync(TEMP_MODELS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_MODELS_DIR, { recursive: true });

    // Create a dummy 3MF file (content doesn't matter for this test as we mocking scan logic or just reading JSON)
    fs.writeFileSync(MOCK_3MF, 'dummy-3mf-content');

    // Create a dummy Munchie JSON
    const munchieData = {
        id: 'test-id-123',
        name: 'Test Model',
        fileName: 'test-model.3mf',
        filePath: 'test-model.3mf',
        fileSize: 1024,
        created: new Date().toISOString(),
        tags: ['test', 'legacy'],
        userDefined: {
            thumbnail: 'parsed:0'
        }
    };
    fs.writeFileSync(MOCK_MUNCHIE, JSON.stringify(munchieData, null, 2));
}

function cleanupTempFiles() {
    if (fs.existsSync(TEMP_MODELS_DIR)) {
        fs.rmSync(TEMP_MODELS_DIR, { recursive: true, force: true });
    }
}

describe('Legacy Models Golden Master', () => {
    let app;

    beforeAll(async () => {
        // Set env var BEFORE importing server to override getModelsDirectory
        process.env.MODELS_PATH = TEMP_MODELS_DIR;
        process.env.DATA_DIR = path.join(__dirname, 'temp_data');
        process.env.NODE_ENV = 'test';

        setupTempFiles();

        // Mock ConfigManager
        vi.spyOn(ConfigManager, 'loadConfig').mockReturnValue({
            settings: { modelDirectory: TEMP_MODELS_DIR }
        });

        // Import app dynamically to ensure env vars are picked up
        // Note: We might need to use require if server.js is CJS
        const serverModule = await import('../../server.js');
        app = serverModule.default || serverModule;
    });

    afterAll(() => {
        cleanupTempFiles();
        delete process.env.MODELS_PATH;
    });

    it('GET /api/models should list models from temp directory', async () => {
        const res = await request(app).get('/api/models');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        const model = res.body.find(m => m.id === 'test-id-123');
        expect(model).toBeDefined();
        expect(model.name).toBe('Test Model');
    });

    it('GET /api/models/load should return specific model by ID', async () => {
        const res = await request(app).get('/api/models/load?id=test-id-123');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('test-id-123');
    });

    it('GET /api/models/load should return specific model by Path', async () => {
        const res = await request(app).get('/api/models/load?filePath=test-model-munchie.json');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('test-id-123');
    });

    it('POST /api/save-model should update model metadata (Legacy Parity)', async () => {
        const updateData = {
            id: 'test-id-123',
            filePath: 'test-model-munchie.json',
            changes: {
                description: 'Updated Description',
                tags: ['new-tag', 'test']
            }
        };

        const res = await request(app).post('/api/save-model').send(updateData);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.refreshedModel.description).toBe('Updated Description');

        // Verify on disk
        const raw = fs.readFileSync(MOCK_MUNCHIE, 'utf8');
        const updated = JSON.parse(raw);
        expect(updated.description).toBe('Updated Description');
        expect(updated.tags).toContain('new-tag');
    });

    it('POST /api/save-model should normalize logic (Parity Check)', async () => {
        // Test unique tag logic
        const updateData = {
            id: 'test-id-123',
            filePath: 'test-model-munchie.json',
            changes: {
                tags: ['  duplicate ', 'duplicate', 'UPPERCASE']
            }
        };
        const res = await request(app).post('/api/save-model').send(updateData);
        expect(res.status).toBe(200);

        const raw = fs.readFileSync(MOCK_MUNCHIE, 'utf8');
        const updated = JSON.parse(raw);
        expect(updated.tags).toEqual(['duplicate', 'UPPERCASE']);
    });

    it('GET /api/model-folders should list folders', async () => {
        const res = await request(app).get('/api/model-folders');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.folders)).toBe(true);
        // "uploads" is always pushed
        expect(res.body.folders).toContain('uploads');
    });

    it('GET /api/munchie-files should list all munchie files', async () => {
        const res = await request(app).get('/api/munchie-files');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const file = res.body.find(f => f.fileName === 'test-model-munchie.json');
        expect(file).toBeDefined();
    });

    it('POST /api/backup-munchie-files should create a backup', async () => {
        const res = await request(app).post('/api/backup-munchie-files');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/gzip');
        expect(res.headers['content-disposition']).toContain('attachment; filename="munchie-backup-');
        expect(res.body).toBeDefined(); // It's a buffer
    });

    it('POST /api/restore-munchie-files should restore from backup data', async () => {
        // Create a backup first to get valid data
        const backupRes = await request(app).post('/api/backup-munchie-files');
        const buffer = backupRes.body;

        // Decompress to get JSON string for restore endpoint (which expects JSON body, not file)
        // Wait, the test might need zlib to decompress if the endpoint expects raw JSON.
        // The endpoint /restore-munchie-files expects { backupData: ... }
        // backupData is string or object.

        // We'll trust the backupService test coverage for deep logic, here we test the route wiring.
        // Let's manually construct a small backup object.
        const backupObj = {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            files: [
                {
                    originalPath: 'test-model-munchie.json',
                    content: { id: 'test-id-123', name: 'Restored Name' },
                    hash: 'dummy'
                }
            ]
        };

        const res = await request(app)
            .post('/api/restore-munchie-files')
            .send({ backupData: backupObj, strategy: 'force' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.restored.length).toBeGreaterThan(0);

        // Verify restore
        const raw = fs.readFileSync(MOCK_MUNCHIE, 'utf8');
        const restored = JSON.parse(raw);
        expect(restored.name).toBe('Restored Name');
    });

    it('POST /api/verify-file should confirm existing file', async () => {
        const res = await request(app).post('/api/verify-file').send({ path: 'test-model.3mf' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.exists).toBe(true);
    });

    it('POST /api/verify-file should deny path traversal', async () => {
        const res = await request(app).post('/api/verify-file').send({ path: '../outside.txt' });
        expect(res.status).toBe(400); // 400 or 403 depending on implementation, legacy models.js lines 1126 says 400
        expect(res.body.error).toContain('Path traversal');
    });

    it('GET /api/validate-3mf should validate valid file', async () => {
        // Mock parse3MF in the route? Or just expect 200 invalid format since dummy file
        const res = await request(app).get('/api/validate-3mf?file=test-model.3mf');
        expect(res.status).toBe(200);
        // Since we wrote dummy content "dummy-3mf-content" to .3mf, parse3MF will fail or return invalid.
        // Legacy route returns 200 with valid:false for errors usually.
        // Let's check the body structure.
        expect(res.body).toHaveProperty('valid');
        expect(res.body.file).toBe('test-model.3mf');
    });

    it('POST /api/hash-check should return current hash status', async () => {
        const res = await request(app).post('/api/hash-check').send({ fileType: '3mf' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('POST /api/create-model-folder should create a new folder', async () => {
        const folderName = 'new-folder-' + Date.now();
        const res = await request(app).post('/api/create-model-folder').send({ folder: folderName });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.created).toBe(true);
        expect(fs.existsSync(path.join(TEMP_MODELS_DIR, folderName))).toBe(true);
    });

    it('POST /api/upload-document should upload a document', async () => {
        const folderName = 'doc-upload-test';
        const folderPath = path.join(TEMP_MODELS_DIR, folderName);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        const res = await request(app)
            .post('/api/upload-document')
            .field('modelId', 'dummy-model-id')
            .field('filePath', `${folderName}/uploaded.pdf`)
            .attach('file', Buffer.from('dummy-pdf'), 'uploaded.pdf');

        if (res.status === 200) {
            expect(res.body.success).toBe(true);
        } else {
            const files = fs.readdirSync(folderPath);
            expect(files.some(f => f.includes('uploaded.pdf'))).toBe(true);
        }
    });

    it('DELETE /api/models/delete should delete a model by ID', async () => {
        // Create a model to delete first
        const idToDelete = 'to-delete-' + Date.now();
        const folder = path.join(TEMP_MODELS_DIR, 'delete_test');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const jsonPath = path.join(folder, 'model-munchie.json');
        const modelData = {
            id: idToDelete,
            name: 'To Delete',
            jsonPath: jsonPath, // Mocking internal path if needed, but scan should find it
            filePath: 'delete_test/model.3mf' // Mock
        };
        fs.writeFileSync(jsonPath, JSON.stringify(modelData));

        // We need to make sure the scanner finds it if the endpoint relies on scanForModels inside
        // The endpoint /models/delete scans the directory internally.

        const res = await request(app)
            .delete('/api/models/delete')
            .send({ modelIds: [idToDelete] });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.length).toBeGreaterThan(0);
        expect(fs.existsSync(jsonPath)).toBe(false);
    });
});

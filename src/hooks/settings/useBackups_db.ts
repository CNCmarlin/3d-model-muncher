import { useRef, useState } from 'react';

interface UseBackupsProps {
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    setStatusMessage: (msg: string) => void;
}

interface BackupEntry {
    name: string;
    timestamp: string;
    size: number;
}

const HISTORY_KEY = 'db_backup_history';
const MAX_HISTORY = 10;

function loadHistory(): BackupEntry[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveHistory(entries: BackupEntry[]) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
    } catch { /* ignore quota errors */ }
}

/**
 * DB-FIRST Backup Hook
 * - Create Backup: POST /api/admin/backup-db → downloads a JSON snapshot of the DB
 * - Restore:       POST /api/admin/restore-db → uploads JSON, upserts records (merge | replace)
 * - backupHistory  persisted in localStorage so it survives page reloads
 */
export function useBackups_db({
    setSaveStatus,
    setStatusMessage
}: UseBackupsProps) {
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    // Persisted across reloads via localStorage
    const [backupHistory, _setBackupHistory] = useState<BackupEntry[]>(() => loadHistory());

    const setBackupHistory = (updater: (prev: BackupEntry[]) => BackupEntry[]) => {
        _setBackupHistory(prev => {
            const next = updater(prev);
            saveHistory(next);
            return next;
        });
    };

    const [restoreResult, setRestoreResult] = useState<{
        restoredModels: number;
        restoredCollections: number;
        skipped: number;
        errors: any[];
        summary: string;
    } | null>(null);

    // Single strategy: merge (safe default) or replace (destructive)
    const [restoreStrategy, setRestoreStrategy] = useState<'merge' | 'replace'>('merge');

    const backupFileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateBackup = async () => {
        setIsCreatingBackup(true);
        setSaveStatus('saving');
        setStatusMessage('Exporting database snapshot...');

        try {
            const response = await fetch('/api/admin/backup-db', { method: 'POST' });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create backup');
            }

            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition?.match(/filename="(.+)"/)?.[1]
                || `db-backup-${new Date().toISOString().slice(0, 10)}.json`;

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const newEntry: BackupEntry = {
                name: filename,
                timestamp: new Date().toISOString(),
                size: blob.size,
            };

            // Persist to localStorage immediately
            setBackupHistory(prev => [newEntry, ...prev]);

            setSaveStatus('saved');
            setStatusMessage(`Backup downloaded: ${filename}`);
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to create backup');
            console.error('Backup error:', error);
        } finally {
            setIsCreatingBackup(false);
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
        }
    };

    const handleRestoreFromFile = () => {
        backupFileInputRef.current?.click();
    };

    const handleBackupFileRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsRestoring(true);
        setSaveStatus('saving');
        setStatusMessage('Restoring database from backup...');

        try {
            const formData = new FormData();
            formData.append('backupFile', file);
            formData.append('strategy', restoreStrategy);

            const response = await fetch('/api/admin/restore-db', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Restore failed');

            setRestoreResult({
                restoredModels: result.restoredModels ?? 0,
                restoredCollections: result.restoredCollections ?? 0,
                skipped: result.skipped ?? 0,
                errors: result.errors ?? [],
                summary: result.summary ?? 'Restore complete'
            });
            setSaveStatus('saved');
            setStatusMessage(result.summary || 'Restore complete');
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to restore from backup');
            console.error('Restore error:', error);
        } finally {
            setIsRestoring(false);
            event.target.value = '';
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 4000);
        }
    };

    return {
        // State
        isCreatingBackup,
        isRestoring,
        backupHistory,
        restoreResult,
        restoreStrategy,
        setRestoreStrategy,
        backupFileInputRef,

        // Actions
        handleCreateBackup,
        handleRestoreFromFile,
        handleBackupFileRestore,
    };
}

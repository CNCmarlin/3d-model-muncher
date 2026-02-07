import { useRef, useState } from 'react';

interface UseBackupsProps {
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    setStatusMessage: (msg: string) => void;
}

export function useBackups({
    setSaveStatus,
    setStatusMessage
}: UseBackupsProps) {
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [backupHistory, setBackupHistory] = useState<Array<{
        name: string;
        timestamp: string;
        size: number;
        fileCount: number;
    }>>([]);

    // Strategies
    const [restoreStrategy, setRestoreStrategy] = useState<'hash-match' | 'path-match' | 'force'>('hash-match');
    const [collectionsRestoreStrategy, setCollectionsRestoreStrategy] = useState<'merge' | 'replace'>('merge');

    const backupFileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateBackup = async () => {
        setIsCreatingBackup(true);
        setSaveStatus('saving');
        setStatusMessage('Creating backup of munchie.json files...');

        try {
            const response = await fetch('/api/backup-munchie-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                throw new Error('Failed to create backup');
            }

            // Get the filename from the response headers
            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `munchie-backup-${new Date().toISOString().slice(0, 19)}.gz`;

            // Download the backup file
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Update backup history
            const newBackup = {
                name: filename,
                timestamp: new Date().toISOString(),
                size: blob.size,
                fileCount: 0
            };
            setBackupHistory(prev => [newBackup, ...prev].slice(0, 10));

            setSaveStatus('saved');
            setStatusMessage(`Backup created successfully: ${filename}`);
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to create backup');
            console.error('Backup creation error:', error);
        } finally {
            setIsCreatingBackup(false);
            setTimeout(() => {
                setSaveStatus('idle');
                setStatusMessage('');
            }, 3000);
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
        setStatusMessage('Restoring from backup file...');

        try {
            if (file.name.endsWith('.gz')) {
                // Use file upload for gzipped files
                const formData = new FormData();
                formData.append('backupFile', file);
                formData.append('strategy', restoreStrategy);
                formData.append('collectionsStrategy', collectionsRestoreStrategy);

                const response = await fetch('/api/restore-munchie-files/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || 'Restore failed');
                }

                setSaveStatus('saved');
                setStatusMessage(`Restore completed: ${result.summary}`);
                console.log('Restore results:', result);

            } else {
                // Handle plain JSON files
                const buffer = await file.arrayBuffer();
                const backupData = new TextDecoder().decode(buffer);

                // Send restore request to backend
                const response = await fetch('/api/restore-munchie-files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        backupData,
                        strategy: restoreStrategy,
                        collectionsStrategy: collectionsRestoreStrategy
                    })
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || 'Restore failed');
                }

                setSaveStatus('saved');
                setStatusMessage(`Restore completed: ${result.summary}`);
                console.log('Restore results:', result);
            }

        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to restore from backup');
            console.error('Restore error:', error);
        } finally {
            setIsRestoring(false);
            // Clear the file input
            event.target.value = '';
            setTimeout(() => {
                setSaveStatus('idle');
                setStatusMessage('');
            }, 3000);
        }
    };

    return {
        // State
        isCreatingBackup,
        isRestoring,
        backupHistory,
        restoreStrategy,
        setRestoreStrategy,
        collectionsRestoreStrategy,
        setCollectionsRestoreStrategy,
        backupFileInputRef,

        // Actions
        handleCreateBackup,
        handleRestoreFromFile,
        handleBackupFileRestore
    };
}

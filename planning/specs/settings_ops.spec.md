
# Backup & Integrity Operations Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Immutable reference for reconstructing `SettingsOps.tsx` or similar.

## 1. State Logic
```typescript
  // Backup State
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupHistory, setBackupHistory] = useState<BackupInfo[]>([]);
  const [restoreStrategy, setRestoreStrategy] = useState<'hash-match' | 'path-match' | 'force'>('hash-match');
  const [collectionsRestoreStrategy, setCollectionsRestoreStrategy] = useState<'merge' | 'replace'>('merge');

  // Integrity State
  const [hashCheckResult, setHashCheckResult] = useState<HashCheckResult | null>(null);
  const [isHashChecking, setIsHashChecking] = useState(false);
  const [hashCheckProgress, setHashCheckProgress] = useState(0);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [openDuplicateGroupHash, setOpenDuplicateGroupHash] = useState<string | null>(null);
  const [selectedFileTypes, setSelectedFileTypes] = useState({ "3mf": true, "stl": true });

  // Heal State
  const [isHealing, setIsHealing] = useState(false);
  const [healPreviewReport, setHealPreviewReport] = useState<any>(null);
  const [isHealDialogOpen, setIsHealDialogOpen] = useState(false);
  const [healResult, setHealResult] = useState<any>(null); // Post-heal summary
  const [isPreviewingHeal, setIsPreviewingHeal] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [canRevert, setCanRevert] = useState(false);
```

## 2. Backup Handlers
```typescript
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
        fileCount: 0 // Will be updated if we parse the backup
      };
      setBackupHistory(prev => [newBackup, ...prev].slice(0, 10)); // Keep last 10 backups

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

  const handleBackupFileRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setSaveStatus('saving');
    setStatusMessage('Restoring from backup file...');

    try {
       // Logic handles both .gz (FormData) and .json (Text body)
       // ... (See extracted block in main inventory for full implementation)
       // Key params: strategy, collectionsStrategy
    } catch (error) {
       // ... error handling
    } finally {
      setIsRestoring(false);
      // Clear input
      event.target.value = '';
    }
  };
```

## 3. Integrity Handlers
```typescript
  const handleRunHashCheck = async (fileType?: "3mf" | "stl") => {
     // ... (Complex logic extracted in Pass 1 inventory) ...
     // Calls /api/hash-check
     // Uses createStandardModelIdentity factory
     // Updates duplicateGroups and hashCheckResult
  };

  const handleRemoveDuplicates = async (group: DuplicateGroup, keepModelId: string): Promise<boolean> => {
    // Calls /api/delete-models
    // Updates UI state to remove processed group
  };

  const handleRunHealPreview = async () => {
    // Calls /api/heal-library-preview
    // Sets healPreviewReport
    // Opens Dialog
  };
```

## 4. UI Render Block
```tsx
          {/* Backup & Restore Tab */}
          <TabsContent value="backup" className="space-y-6 mt-0">
             {/* ... Create Backup Button ... */}
             {/* ... Restore Strategy Selectors ... */}
             {/* ... Restore File Input Trigger ... */}
             {/* ... Backup History List ... */}
          </TabsContent>

          {/* Integrity Tab */}
           <TabsContent value="integrity" className="space-y-6">
             {/* ... File Type Checkboxes ... */}
             {/* ... Action Buttons (Check, Generate, Heal, Revert) ... */}
             {/* ... Results (Heal Summary, Hash Stats) ... */}
             {/* ... Corrupted Files List ... */}
             {/* ... Duplicate Groups List (Blue alerts) ... */}
           </TabsContent>
```

## 5. Dependent Dialogs
- `DuplicateGroupDialog` (Inline in Integrity tab)
- `HealPreviewDialog` (Lines 3785-3874)

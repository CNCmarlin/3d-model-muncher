/**
 * useHeal_db — DB-mode library heal hook.
 *
 * Calls POST /api/admin/db-heal with optional dryRun flag.
 * Returns a structured report from healService_db.js.
 */
import { useState } from 'react';

export interface HealEmbeddedReport {
    processed: number;
    extracted: number;
    alreadyDone: number;
    noEmbed: number;
    errors: { model?: string; error: string }[];
}

export interface HealGalleryReport {
    processed: number;
    added: number;
    errors: { model?: string; error: string }[];
}

export interface HealStaleReport {
    processed: number;
    removed: number;
    errors: { imageId?: string; error: string }[];
}

export interface HealDetail {
    model: string;
    additions: string[];
    deletions: string[];
    modifications: string[];
}

export interface HealReport {
    dryRun: boolean;
    embedded: HealEmbeddedReport;
    gallery: HealGalleryReport;
    stale: HealStaleReport;
    details: HealDetail[];
}

export function useHeal_db() {
    const [isHealing, setIsHealing] = useState(false);
    const [healReport, setHealReport] = useState<HealReport | null>(null);
    const [healError, setHealError] = useState<string | null>(null);
    const [isHealDialogOpen, setIsHealDialogOpen] = useState(false);

    /** Run a dry-run heal and open the preview dialog. */
    const handlePreviewHeal = async () => {
        setIsHealing(true);
        setHealError(null);
        setHealReport(null);
        try {
            const res = await fetch('/api/admin/db-heal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: true }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Preview failed');
            setHealReport(data.report);
            setIsHealDialogOpen(true);
        } catch (e: any) {
            setHealError(e.message);
        } finally {
            setIsHealing(false);
        }
    };

    /** Apply the heal (no dry-run). */
    const handleConfirmHeal = async () => {
        setIsHealing(true);
        setHealError(null);
        try {
            const res = await fetch('/api/admin/db-heal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: false }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Heal failed');
            setHealReport(data.report);
            setIsHealDialogOpen(false);
        } catch (e: any) {
            setHealError(e.message);
        } finally {
            setIsHealing(false);
        }
    };

    const totalChanges = healReport
        ? healReport.embedded.extracted + healReport.gallery.added + healReport.stale.removed
        : 0;

    return {
        isHealing,
        healReport,
        healError,
        isHealDialogOpen,
        setIsHealDialogOpen,
        handlePreviewHeal,
        handleConfirmHeal,
        totalChanges,
    };
}

import { Clock } from 'lucide-react';

interface LastRunLabelProps {
    timestamp?: string | null;
    label?: string;
}

/**
 * Displays a friendly "Last run: X ago" label or "Never run" if no timestamp.
 * Renders below action buttons to show when an operation was last performed.
 */
export function LastRunLabel({ timestamp, label = 'Last run' }: LastRunLabelProps) {
    if (!timestamp) {
        return (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                <span>Never run</span>
            </p>
        );
    }

    const formatted = formatRelativeTime(timestamp);

    return (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1" title={new Date(timestamp).toLocaleString()}>
            <Clock className="h-3 w-3" />
            <span>{label}: {formatted}</span>
        </p>
    );
}

function formatRelativeTime(isoDate: string): string {
    try {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);

        if (diffSec < 60) return 'just now';
        if (diffSec < 3600) {
            const mins = Math.floor(diffSec / 60);
            return `${mins}m ago`;
        }
        if (diffSec < 86400) {
            const hours = Math.floor(diffSec / 3600);
            return `${hours}h ago`;
        }
        if (diffSec < 604800) {
            const days = Math.floor(diffSec / 86400);
            return `${days}d ago`;
        }
        // Older than a week: show the date
        return date.toLocaleDateString();
    } catch {
        return isoDate;
    }
}

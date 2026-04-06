/**
 * Shared time utilities for 3D Model Muncher.
 * Handles conversion between numeric seconds used in DB and human-readable duration strings (H:M).
 */

/**
 * Normalizes seconds into a human-readable duration string.
 * Example: 5400 -> "1h 30m"
 */
export function formatSecondsToDuration(seconds: number | undefined | null): string {
    if (seconds === undefined || seconds === null || seconds === 0) return 'Unknown';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (hours === 0 && secs > 0) parts.push(`${secs}s`);

    return parts.length > 0 ? parts.join(' ') : '0m';
}

/**
 * Parses a numeric input or a duration string into total seconds.
 * Supports format like "1h 30m", "45m", "90", etc.
 */
export function parseDurationToSeconds(input: string | number | undefined | null): number {
    if (input === undefined || input === null) return 0;
    if (typeof input === 'number') return input;

    const s = String(input).trim();
    if (!s) return 0;

    // Check if it's just a number string
    const pureNumber = parseFloat(s);
    if (!isNaN(pureNumber) && /^\d+(\.\d+)?$/.test(s)) {
        return Math.floor(pureNumber);
    }

    // Parse H, M, S components
    let totalSeconds = 0;
    const h = s.match(/(\d+)h/i);
    const m = s.match(/(\d+)m/i);
    const s_match = s.match(/(\d+)s/i);

    if (h) totalSeconds += parseInt(h[1]) * 3600;
    if (m) totalSeconds += parseInt(m[1]) * 60;
    if (s_match) totalSeconds += parseInt(s_match[1]);

    return totalSeconds;
}

/**
 * Splits seconds into { hours, minutes } for UI inputs.
 */
export function secondsToHM(seconds: number | undefined | null): { hours: number; minutes: number } {
    if (!seconds) return { hours: 0, minutes: 0 };
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return { hours: h, minutes: m };
}

/**
 * Combines hours and minutes back into seconds.
 */
export function hmToSeconds(hours: number, minutes: number): number {
    return (hours * 3600) + (minutes * 60);
}

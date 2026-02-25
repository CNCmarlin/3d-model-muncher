/**
 * Time utility for server-side use.
 */

function parseDurationToSeconds(input) {
    if (input === undefined || input === null) return 0;
    if (typeof input === 'number') return Math.floor(input);

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

module.exports = { parseDurationToSeconds };

const fs = require('fs');
const path = require('path');

/**
 * Recursive find by ID
 * @param {string} dir - directory to search
 * @param {string} id - model ID to find
 * @returns {string|null} Absolute path to munchie.json file
 */
function findById(dir, id) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findById(full, id);
            if (found) return found;
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
            try {
                const raw = fs.readFileSync(full, 'utf8');
                const data = JSON.parse(raw);
                if (String(data.id) === String(id)) return full;
            } catch (e) { }
        }
    }
    return null;
}

module.exports = { findById };

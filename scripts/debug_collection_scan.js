const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MODEL_DIR = 'W:/3D Files Cabinet - Copy';

function scan(dir, depth = 0) {
    if (depth > 2) return;
    try {
        const files = fs.readdirSync(dir);
        // Check for images
        const images = files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));

        if (images.length > 0) {
            console.log(`[DIR] ${dir}`);
            console.log('  Images:', images);
        }

        // Recurse
        for (const f of files) {
            const full = path.join(dir, f);
            if (fs.statSync(full).isDirectory() && !f.startsWith('.')) {
                scan(full, depth + 1);
            }
        }
    } catch (e) { }
}

console.log('Scanning for images in', MODEL_DIR);
scan(MODEL_DIR);

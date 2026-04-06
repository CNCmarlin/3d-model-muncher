import * as path from 'path';
import { generateThumbnail } from './src/utils/thumbnailGenerator_db.js';

async function run() {
    const modelsDir = path.join(process.cwd(), 'models');
    const modelUrl = path.join(modelsDir, 'test_sonos.stl');
    const outputPath = path.join(process.cwd(), 'test_sonos_output.png');
    const baseUrl = 'http://localhost:3001'; // Assuming server is running

    console.log('Generating thumbnail for:', modelUrl);
    console.log('Output to:', outputPath);

    await generateThumbnail(modelUrl, outputPath, baseUrl, '#6366f1', modelsDir);

    console.log('Done!');
}

run().catch(console.error);

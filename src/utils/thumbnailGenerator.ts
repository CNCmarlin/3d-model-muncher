import puppeteer from 'puppeteer';
import * as path from 'path';

export async function generateThumbnail(modelUrl: string, outputPath: string, baseUrl: string, modelColor: string = '#6366f1' ) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', 
      '--disable-gpu',                 // Disable real GPU
      '--enable-unsafe-swiftshader',   // 👈 ENABLE SOFTWARE RENDERING (The Fix)
      '--use-gl=swiftshader'           // Force it to use SwiftShader
    ]
  });

  try {
    const page = await browser.newPage();
    
    // [DIAGNOSTIC] Pipe browser logs to your terminal
    // This will let us see "404 Not Found" or "WebGL Error"
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err: any) => console.log('PAGE ERROR:', err.toString()));
    await page.setViewport({ width: 512, height: 512 });

    // [FIX] Convert Absolute Path to Server URL
    // Incoming: /home/user/3d-model-muncher/models/Props/Sword.stl
    // Required: /models/Props/Sword.stl (assuming your server mounts 'models' at root or /models)
    
    // This simple logic attempts to find "models/" in the path and keep everything after it.
    let cleanUrl = modelUrl;
    if (modelUrl.includes('models/')) {
        cleanUrl = '/models/' + modelUrl.split('models/')[1];
    }
    // Ensure we aren't passing windows backslashes in a URL
    cleanUrl = cleanUrl.replace(/\\/g, '/');

    const is3mf = modelUrl.toLowerCase().endsWith('.3mf');
    const type = is3mf ? '3mf' : 'stl';
    
    // Pass the CLEAN relative URL, not the absolute file path
    const captureUrl = `${baseUrl}/capture.html?url=${encodeURIComponent(cleanUrl)}&type=${type}&color=${encodeURIComponent(modelColor)}`;

    console.log(`📸 Snapping: ${path.basename(modelUrl)}`);
    console.log(`   ➜ Loading URL: ${captureUrl}`); // Log this to verify!

    await page.goto(captureUrl);

    // [FIX] Increased timeout to 30s (3D models can be heavy)
    await page.waitForFunction('window.captureReady === true', { timeout: 30000 });

    await page.screenshot({ path: outputPath, omitBackground: true });
    console.log(`✅ Saved: ${outputPath}`);

  } catch (error) {
    console.error(`❌ Failed to generate thumbnail for ${modelUrl}:`, error);
  } finally {
    await browser.close();
  }
}
import puppeteer from 'puppeteer';
import * as path from 'path';

export async function generateThumbnail(modelUrl: string, outputPath: string, baseUrl: string, modelColor: string = '#6366f1', modelsDir: string ) {
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

    let cleanUrl: string;

    // 1. Calculate the path relative to the models root directory
    // Example: /app/models/Dir/file.stl --> Dir/file.stl
    const relativePath = path.relative(modelsDir, modelUrl);

    // 2. Prepend the web server context path (`/models`)
    // Example: Dir/file.stl --> /models/Dir/file.stl
    cleanUrl = '/models/' + relativePath;

    // 3. Normalize slashes (crucial for Windows systems running in containers)
    cleanUrl = cleanUrl.replace(/\\/g, '/');
    
    // Check if the path starts with /models/ or the correct context
    if (!cleanUrl.startsWith('/models/')) {
        console.warn(`[ThumbnailGen] Path sanity check failed. Cleaned URL: ${cleanUrl}. Original URL: ${modelUrl}`);
        // Fallback or attempt to correct if path.relative returned something unexpected
        cleanUrl = '/models/' + path.basename(modelUrl);
    }
    
    // Note: The URL encoding happens in the final captureUrl construction below
    
    const is3mf = modelUrl.toLowerCase().endsWith('.3mf');
    const type = is3mf ? '3mf' : 'stl';
    
    // Pass the CLEAN relative URL, not the absolute file path
    const captureUrl = `${baseUrl}/capture.html?url=${encodeURIComponent(cleanUrl)}&type=${type}&color=${encodeURIComponent(modelColor)}`;
    // ------------------------------------------------------------------
    
    console.log(`📸 Snapping: ${path.basename(modelUrl)}`);
    console.log(`   ➜ Loading URL: ${captureUrl}`); // Log this to verify!

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
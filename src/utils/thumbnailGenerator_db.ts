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
    page.on('error', err => console.error('PUPPETEER BROWSER ERROR:', err.toString()));
    await page.setViewport({ width: 512, height: 512 });

    // ------------------------------------------------------------------
    // [FIX] Convert Absolute Filesystem Path to Server URL Path (404 FIX v3)
    // ------------------------------------------------------------------
    let cleanUrl: string;

    // 1. Calculate the path relative to the models root directory
    // Example: /app/models/Dir/file.stl --> Dir/file.stl
    let relativePath = path.relative(modelsDir, modelUrl);

    // 2. Normalize and Clean the path string for URL use:
    //    - Ensure forward slashes (path.posix.sep)
    //    - Trim any leading/trailing slashes that path.relative might leave.
    
    // We use POSIX separators and clean up potential leading slashes
    // The replace(/\/\//g, '/') at the end of the URL construction is often not enough.

    // Force POSIX separators and remove any leading/trailing slashes from the relative portion
    let normalizedRelative = relativePath.replace(/\\/g, path.posix.sep).replace(/^\/+|\/+$/g, '');

    // 3. Prepend the web server context path (`/models`)
    // We use path.posix.join to safely build the final web path
    cleanUrl = path.posix.join('/models', normalizedRelative); 
    
    // 4. Ensure it starts with a single leading slash (for URL context)
    if (!cleanUrl.startsWith('/')) {
        cleanUrl = '/' + cleanUrl;
    }
    
    // Check if the path contains '..' (security check against path traversal)
    if (cleanUrl.includes('..')) {
        console.error(`[ThumbnailGen] Security check failed: Path traversal detected in ${cleanUrl}`);
        // Fallback to a safe name or throw an error
        cleanUrl = '/models/' + path.basename(modelUrl);
    }
    
    // Note: The URL encoding happens in the final captureUrl construction below
    
    const is3mf = modelUrl.toLowerCase().endsWith('.3mf');
    const type = is3mf ? '3mf' : 'stl';
    
    // Pass the CLEAN relative URL
    // The encodeURIComponent handles the spaces ('3D Printer' -> '3D%20Printer')
    const captureUrl = `${baseUrl}/capture.html?url=${encodeURIComponent(cleanUrl)}&type=${type}&color=${encodeURIComponent(modelColor)}`;
    // ------------------------------------------------------------------
    
    console.log(`📸 Snapping: ${path.basename(modelUrl)}`);
    console.log(`   ➜ Loading URL: ${captureUrl}`); // Log this to verify!

    console.log(`[THUMB GEN] Final Capture URL: ${captureUrl}`);
    await page.goto(captureUrl);

    try {
      await page.waitForFunction('window.modelLoaded === true', { timeout: 10000 }); // Wait for 10s only
      console.log("PAGE LOG: Model file successfully loaded into memory.");
  } catch (e) {
      console.warn("PAGE LOG: Model file load took longer than 10 seconds.");
  }

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
// src/utils/themeUtils.ts

// Helper: Convert Hex to HSL values (h, s, l)
function hexToValues(hex: string) {
    const cleanHex = (hex || '').replace(/^#/, '');
    let r = 0, g = 0, b = 0;
    if (cleanHex.length === 3) {
      r = parseInt("0x" + cleanHex[0] + cleanHex[0]);
      g = parseInt("0x" + cleanHex[1] + cleanHex[1]);
      b = parseInt("0x" + cleanHex[2] + cleanHex[2]);
    } else if (cleanHex.length === 6) {
      r = parseInt("0x" + cleanHex.substring(0, 2));
      g = parseInt("0x" + cleanHex.substring(2, 4));
      b = parseInt("0x" + cleanHex.substring(4, 6));
    }
    r /= 255; g /= 255; b /= 255;
    const cmin = Math.min(r, g, b), cmax = Math.max(r, g, b), delta = cmax - cmin;
    let h = 0, s = 0, l = 0;
    if (delta === 0) h = 0;
    else if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    l = (cmax + cmin) / 2;
    s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return { h, s: +(s * 100).toFixed(1), l: +(l * 100).toFixed(1) };
  }
  
  export function applyThemeColor(hexColor: string | null) {
    const root = document.documentElement;
  
    // 1. RESET: Clear ALL overrides if null
    if (!hexColor) {
      const varsToRemove = [
        // Core Brand
        '--brand-primary', '--brand-secondary', 
        '--brand-dark', '--brand-dark-bg',
        '--brand-muted-dark', '--brand-surface-dark',
        '--brand-light-bg', '--brand-accent-light',
        '--brand-border-light', '--brand-border-dark',
        // Semantic mappings
        '--primary', '--ring', 
        '--sidebar-primary', '--sidebar-ring'
      ];
      varsToRemove.forEach(v => root.style.removeProperty(v));
      return;
    }
    
    const { h, s, l } = hexToValues(hexColor);
  
    // --- 2. DYNAMIC PALETTE GENERATION ---
    
    // PRIMARY: The user's exact color
    const primaryVal = `hsl(${h}, ${s}%, ${l}%)`;
  
    // SECONDARY: Lighter, slightly shifted hue
    const secondaryL = l > 50 ? Math.max(l - 15, 10) : Math.min(l + 15, 90);
    const secondaryVal = `hsl(${h + 5}, ${s}%, ${secondaryL}%)`;
  
    // --- BACKGROUND TINTS ---
    // We tint the greys with the user's hue, but cap saturation so it doesn't look neon.
    const bgSat = Math.max(Math.min(s * 0.3, 20), 5); // Low saturation (5-20%) for backgrounds
  
    // DARK MODE VARIABLES
    // --brand-dark: Main dark card background (previously #1a1625 deep purple)
    const brandDark = `hsl(${h}, ${bgSat}%, 12%)`; 
    // --brand-dark-bg: Darkest body background (previously #0f0a1a)
    const brandDarkBg = `hsl(${h}, ${bgSat}%, 7%)`;
    // --brand-surface-dark: Slightly lighter dark (for inputs/muted areas)
    const brandSurfaceDark = `hsl(${h}, ${bgSat}%, 16%)`;
    // --brand-muted-dark: Dark text/icon color on light backgrounds (previously #2d1b4e)
    const brandMutedDark = `hsl(${h}, ${Math.min(s * 0.6, 40)}%, 20%)`;
  
    // LIGHT MODE VARIABLES
    // --brand-light-bg: Sidebar/Secondary background (previously #f3f1f7)
    const brandLightBg = `hsl(${h}, ${Math.min(s * 0.3, 15)}%, 96%)`;
    // --brand-accent-light: Highlight/Hover background (previously #ede8f5)
    const brandAccentLight = `hsl(${h}, ${Math.min(s * 0.4, 30)}%, 94%)`;
  
    // BORDERS
    // --brand-border-light: Light mode borders (previously #d6cfe6)
    const brandBorderLight = `hsl(${h}, ${Math.min(s * 0.2, 15)}%, 85%)`;
    // --brand-border-dark: Dark mode borders (previously #3a2b4a)
    const brandBorderDark = `hsl(${h}, ${Math.min(s * 0.3, 20)}%, 25%)`;
  
  
    // --- 3. APPLY VARIABLES ---
    
    // Core Colors
    root.style.setProperty('--brand-primary', primaryVal);
    root.style.setProperty('--brand-secondary', secondaryVal);
    
    // Dark Theme Structure
    root.style.setProperty('--brand-dark', brandDark);
    root.style.setProperty('--brand-dark-bg', brandDarkBg);
    root.style.setProperty('--brand-surface-dark', brandSurfaceDark);
    root.style.setProperty('--brand-muted-dark', brandMutedDark);
  
    // Light Theme Structure
    root.style.setProperty('--brand-light-bg', brandLightBg);
    root.style.setProperty('--brand-accent-light', brandAccentLight);
  
    // Borders
    root.style.setProperty('--brand-border-light', brandBorderLight);
    root.style.setProperty('--brand-border-dark', brandBorderDark);
  
    // Semantic Overrides (Direct mappings)
    root.style.setProperty('--primary', primaryVal);
    root.style.setProperty('--ring', primaryVal);
    root.style.setProperty('--sidebar-primary', primaryVal);
    root.style.setProperty('--sidebar-ring', primaryVal);
  }
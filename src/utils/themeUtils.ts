// src/utils/themeUtils.ts

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
  
  // [NEW] Helper to inject dynamic CSS for gradients
  function updateGradientStyles(primary: string, secondary: string, accent: string, darkBg: string) {
    const styleId = 'theme-gradient-overrides';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
  
    // We overwrite the classes defined in globals.css
    // Note: We use !important to ensure these override the CSS file utilities
    const css = `
      .bg-gradient-primary {
        background: linear-gradient(135deg, ${primary} 0%, ${secondary} 100%) !important;
      }
      .bg-gradient-secondary {
        background: linear-gradient(135deg, ${secondary} 0%, ${accent} 100%) !important;
      }
      .bg-gradient-accent {
        background: linear-gradient(135deg, ${accent} 0%, var(--brand-light-bg) 100%) !important;
      }
      .bg-gradient-dark {
        background: linear-gradient(135deg, ${darkBg} 0%, var(--brand-dark) 100%) !important;
      }
    `;
    styleTag.innerHTML = css;
  }
  
  export function applyThemeColor(hexColor: string | null) {
    const root = document.documentElement;
  
    // 1. RESET: Clear vars and remove the style tag
    if (!hexColor) {
      const varsToRemove = [
        '--brand-primary', '--brand-secondary', 
        '--brand-dark', '--brand-dark-bg',
        '--brand-muted-dark', '--brand-surface-dark',
        '--brand-light-bg', '--brand-accent-light',
        '--brand-border-light', '--brand-border-dark',
        '--brand-text-light', '--brand-text-muted',
        '--muted-foreground', '--switch-background',
        '--brand-purple-light', '--brand-purple-lightest', '--brand-purple-pale',
        '--primary', '--ring', 
        '--sidebar-primary', '--sidebar-ring'
      ];
      varsToRemove.forEach(v => root.style.removeProperty(v));
      
      // Remove the injected styles
      const styleTag = document.getElementById('theme-gradient-overrides');
      if (styleTag) styleTag.remove();
      
      return;
    }
    
    const { h, s, l } = hexToValues(hexColor);
  
    // --- 2. CALCULATE COLORS ---
    const primaryVal = `hsl(${h}, ${s}%, ${l}%)`;
    
    // Secondary (Darker/Richer for gradients)
    // We make this distinct so the gradient is visible
    const secondaryL = l > 50 ? Math.max(l - 20, 20) : Math.min(l + 20, 80);
    const secondaryVal = `hsl(${h + 5}, ${s}%, ${secondaryL}%)`;
  
    const bgSat = Math.max(Math.min(s * 0.3, 20), 5); 
    const textSat = Math.max(Math.min(s * 0.2, 15), 0);
  
    const brandDark = `hsl(${h}, ${bgSat}%, 12%)`; 
    const brandDarkBg = `hsl(${h}, ${bgSat}%, 7%)`;
    const brandSurfaceDark = `hsl(${h}, ${bgSat}%, 16%)`;
    const brandMutedDark = `hsl(${h}, ${Math.min(s * 0.6, 40)}%, 20%)`;
  
    const brandTextLight = `hsl(${h}, ${textSat}%, 97%)`; 
    const brandTextMuted = `hsl(${h}, ${textSat}%, 80%)`; 
  
    const brandLightBg = `hsl(${h}, ${Math.min(s * 0.3, 15)}%, 96%)`;
    const brandAccentLight = `hsl(${h}, ${Math.min(s * 0.4, 30)}%, 94%)`;
    const mutedForeground = `hsl(${h}, ${Math.min(s * 0.3, 20)}%, 45%)`;
    const switchBackground = `hsl(${h}, ${Math.min(s * 0.3, 20)}%, 88%)`;
  
    const brandBorderLight = `hsl(${h}, ${Math.min(s * 0.2, 15)}%, 85%)`;
    const brandBorderDark = `hsl(${h}, ${Math.min(s * 0.3, 20)}%, 25%)`;
  
    const purpleLight = `hsl(${h}, ${Math.max(s - 10, 40)}%, 65%)`;    
    const purpleLightest = `hsl(${h}, ${Math.max(s - 20, 30)}%, 75%)`; 
    const purplePale = `hsl(${h}, ${Math.max(s - 30, 20)}%, 90%)`;     
  
    // --- 3. APPLY VARIABLES ---
    root.style.setProperty('--brand-primary', primaryVal);
    root.style.setProperty('--brand-secondary', secondaryVal);
    root.style.setProperty('--brand-dark', brandDark);
    root.style.setProperty('--brand-dark-bg', brandDarkBg);
    root.style.setProperty('--brand-surface-dark', brandSurfaceDark);
    root.style.setProperty('--brand-muted-dark', brandMutedDark);
    root.style.setProperty('--brand-text-light', brandTextLight);
    root.style.setProperty('--brand-text-muted', brandTextMuted);
    root.style.setProperty('--muted-foreground', mutedForeground);
    root.style.setProperty('--brand-light-bg', brandLightBg);
    root.style.setProperty('--brand-accent-light', brandAccentLight);
    root.style.setProperty('--brand-border-light', brandBorderLight);
    root.style.setProperty('--brand-border-dark', brandBorderDark);
    root.style.setProperty('--switch-background', switchBackground);
    root.style.setProperty('--brand-purple-light', purpleLight);
    root.style.setProperty('--brand-purple-lightest', purpleLightest);
    root.style.setProperty('--brand-purple-pale', purplePale);
    root.style.setProperty('--primary', primaryVal);
    root.style.setProperty('--ring', primaryVal);
    root.style.setProperty('--sidebar-primary', primaryVal);
    root.style.setProperty('--sidebar-ring', primaryVal);
  
    // --- 4. INJECT CSS OVERRIDES FOR GRADIENTS ---
    // This overwrites the hardcoded hexes in globals.css classes
    updateGradientStyles(primaryVal, secondaryVal, purpleLight, brandDarkBg);
  }
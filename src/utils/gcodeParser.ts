import { unzipSync } from 'fflate';

export interface GcodeFilament {
  type: string;
  length: string;
  weight: string;
  density?: string;
  color?: string;
}

export interface GcodeMetadata {
  printTime?: string;
  filaments: {
    color?: string;  // Hex code or color name
    type: string;    // e.g. "PLA"
    length: string;  // e.g. "1200mm"
    weight: string;  // e.g. "45g"
  }[];
  totalFilamentWeight?: string;
  gcodeFilePath?: string;
  printSettings?: {
    layerHeight?: string;
    infill?: string;
    nozzle?: string;
    printer?: string;
    material?: string;
  };
}

export function normalizeTime(seconds: number): string {
  if (seconds === 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0 && secs > 0) minutes += 1;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
  } else {
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);
  }
  return parts.join(' ');
}

function parseTimeString(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[=:]/g, '').trim();
}

export function estimateWeightFromLength(lengthMm: number, diameter: number = 1.75, density: number = 1.24): number {
  const radiusMm = diameter / 2;
  const volumeMm3 = Math.PI * radiusMm * radiusMm * lengthMm;
  const volumeCm3 = volumeMm3 / 1000;
  return volumeCm3 * density;
}

export function extractGcodeFrom3MF(buffer: Buffer): string {
  try {
    const unzipped = unzipSync(new Uint8Array(buffer));
    const candidates: Array<{ path: string; priority: number; data: Uint8Array }> = [];
    for (const [filename, data] of Object.entries(unzipped)) {
      if (filename === 'Metadata/plate_1.gcode') candidates.push({ path: filename, priority: 1, data });
      else if (filename.startsWith('Metadata/plate_') && filename.endsWith('.gcode')) candidates.push({ path: filename, priority: 2, data });
      else if (filename.endsWith('.gcode') && !filename.includes('/')) candidates.push({ path: filename, priority: 3, data });
    }
    if (candidates.length === 0) {
      const anyGcode = Object.keys(unzipped).find(k => k.endsWith('.gcode'));
      if (anyGcode) return new TextDecoder().decode(unzipped[anyGcode]);
      throw new Error(`No .gcode file found in 3MF archive.`);
    }
    candidates.sort((a, b) => a.priority - b.priority);
    return new TextDecoder().decode(candidates[0].data);
  } catch (error) {
    throw new Error(`Failed to extract G-code from 3MF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function parseCSV(value: string): string[] {
  const separator = value.includes(';') ? ';' : ',';
  return value.split(separator).map(v => v.trim()).filter(v => v);
}

// [FIX] Updated signature to accept optional filePath
export function parseGcode(gcodeContent: string, filePath?: string): GcodeMetadata {
  const allLines = gcodeContent.split('\n');
  let linesToScan: string[] = [];

  if (allLines.length > 20000) {
    linesToScan = [...allLines.slice(0, 500), ...allLines.slice(allLines.length - 19500)];
  } else {
    linesToScan = allLines;
  }

  const metadata: GcodeMetadata = {
    filaments: [],
    printSettings: {},
    gcodeFilePath: filePath // Store it if provided
  };

  let filamentLengths: string[] = [];
  let filamentWeights: string[] = [];
  let filamentTypes: string[] = [];
  let filamentColors: string[] = [];
  let printTimeRaw: string | null = null;
  let layerHeight: string | null = null;
  let infill: string | null = null;
  let nozzle: string | null = null;
  let printer: string | null = null;

  console.log(`[GcodeParser] Scanning ${linesToScan.length} lines...`);

  const patterns = {
    // [FIX] Strict Time Regex to avoid matching "min_layer_time = 30"
    time: /; (?:total |model )?(?:estimated )?(?:printing |build )time.*[:=]\s*(.*)/i,
    timeCura: /;TIME:(\d+)/i,
    weight: /; (?:total )?filament (?:used|weight) \[g\]\s*[:=]\s*(.*)/i,
    length: /; (?:total )?filament (?:used|length) \[mm\]\s*[:=]\s*(.*)/i,
    lengthCura: /;Filament used:\s*(.*)m/i,
    type: /; filament_type\s*=\s*(.*)/i,
    color: /; filament_co(?:lour|lor)\s*=\s*(.*)/i,
    layerHeight: /; layer_height\s*=\s*([\d.]+)/i,
    infill: /; (?:sparse_)?infill_density\s*=\s*(\d+%?)/i,
    nozzle: /; (?:nozzle_diameter|extruder_nozzle_diameter)\s*=\s*([\d.]+)/i,
    printer: /; printer_model\s*=\s*(.*)/i
  };

  for (const line of linesToScan) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(';')) continue;

    if (!printTimeRaw) {
      let match = trimmed.match(patterns.time);
      if (match) {
        printTimeRaw = parseTimeString(match[1]);
        console.log('[GcodeParser] Found Time:', printTimeRaw);
      }
      else {
        match = trimmed.match(patterns.timeCura);
        if (match) {
          printTimeRaw = normalizeTime(parseInt(match[1]));
          console.log('[GcodeParser] Found timeCura:', printTimeRaw);
        }
      }
    }
    if (filamentWeights.length === 0) {
      const match = trimmed.match(patterns.weight);
      if (match) { filamentWeights = parseCSV(match[1]); console.log('[GcodeParser] Found Weights:', filamentWeights); }
    }
    if (filamentLengths.length === 0) {
      let match = trimmed.match(patterns.length);
      if (match) { filamentLengths = parseCSV(match[1]); }
      else {
        match = trimmed.match(patterns.lengthCura);
        if (match) filamentLengths = [(parseFloat(match[1]) * 1000).toFixed(2)];
      }
    }
    if (filamentTypes.length === 0) {
      const match = trimmed.match(patterns.type);
      // [FIX] Log found material types for debugging
      if (match) {
        filamentTypes = parseCSV(match[1]);
        console.log('[GcodeParser] Found Materials:', filamentTypes);
      }
    }
    if (filamentColors.length === 0) {
      const match = trimmed.match(patterns.color);
      if (match) {
        filamentColors = parseCSV(match[1]);
        console.log('[GcodeParser] Found Material Colors:', filamentColors);
      }

    }
    if (!layerHeight) { const match = trimmed.match(patterns.layerHeight); if (match) layerHeight = match[1]; }
    if (!infill) { const match = trimmed.match(patterns.infill); if (match) infill = match[1]; }
    if (!nozzle) { const match = trimmed.match(patterns.nozzle); if (match) nozzle = match[1]; }
    if (!printer) { const match = trimmed.match(patterns.printer); if (match) printer = match[1]; }
  }

  const count = Math.max(filamentWeights.length, filamentLengths.length, filamentTypes.length, 1);
  let totalWeightCalc = 0;

  for (let i = 0; i < count; i++) {
    const type = filamentTypes[i] || 'Unknown';
    const color = filamentColors[i] || '#888888';
    let weight = filamentWeights[i];
    let length = filamentLengths[i];

    if (!weight && length) {
      const lenVal = parseFloat(length);
      const wVal = estimateWeightFromLength(lenVal, 1.75, 1.24);
      weight = wVal.toFixed(2);
    }

    if (weight || length) {
      metadata.filaments.push({
        type, color,
        length: length ? `${parseFloat(length).toFixed(2)}mm` : '',
        weight: weight ? `${parseFloat(weight).toFixed(2)}g` : ''
      });
      if (weight) totalWeightCalc += parseFloat(weight);
    }
  }

  const primaryMaterial = filamentTypes.length > 0 ? filamentTypes[0] : undefined;

  if (printTimeRaw) {
    metadata.printTime = printTimeRaw;
  }

  if (totalWeightCalc > 0) {
    metadata.totalFilamentWeight = `${totalWeightCalc.toFixed(2)}g`;
  } else if (filamentWeights.length > 0) {
    metadata.totalFilamentWeight = filamentWeights[0].includes('g') ? filamentWeights[0] : `${filamentWeights[0]}g`;
  }

  metadata.printSettings = {
    layerHeight: layerHeight || undefined,
    infill: infill || undefined,
    nozzle: nozzle || undefined,
    printer: printer || undefined,
    material: primaryMaterial
  };



  if (filePath) {
    console.log(`[GcodeParser] Checking filename for time: "${filePath}"`);
  }

  // [FIX] Fallback: If content scan failed, try extracting time from filename
  // Logic: Looks for patterns like "2h30m", "45m", "1h", etc.
  if (!metadata.printTime && filePath) {
    const name = filePath.split('/').pop() || '';

    // Updated Regex: strictly looks for hours/mins/secs groups to avoid matching random numbers
    // Matches: _2h30m_, (2h30m), or space separated
    const timeMatch = name.match(/(\d+h)(\d+m)?(\d+s)?|(\d+m)(\d+s)?/i);

    if (timeMatch) {
      // Join the matched parts (index 0 is the full match)
      metadata.printTime = timeMatch[0].toLowerCase();
      console.log('[GcodeParser] ✅ Recovered Time from Filename:', metadata.printTime);
    } else {
      console.log('[GcodeParser] ❌ No time pattern found in filename.');
    }
  }

  console.log('[GcodeParser] Final Settings:', JSON.stringify(metadata.printSettings));
  return metadata;
}
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(process.cwd(), 'models');
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure directories exist
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- 1. Helper: Generate a simple valid ASCII STL (Cube) ---
function generateCubeSTL(name) {
  return `solid ${name}
facet normal 0 0 -1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 10 10 0
  endloop
endfacet
facet normal 0 0 -1
  outer loop
    vertex 0 0 0
    vertex 10 10 0
    vertex 0 10 0
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 10
    vertex 10 10 10
    vertex 10 0 10
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 10
    vertex 0 10 10
    vertex 10 10 10
  endloop
endfacet
endsolid ${name}`;
}

// --- 2. Create Folders & Files ---
const structure = [
  { folder: 'Vehicles/Cars', name: 'SportsCar', type: 'stl' },
  { folder: 'Vehicles/Trucks', name: 'BigRig', type: 'stl' },
  { folder: 'SciFi/Ships', name: 'StarFighter', type: 'stl' },
  { folder: 'SciFi/Bases', name: 'Outpost', type: 'stl' },
  { folder: 'Props', name: 'Sword', type: 'stl' }
];

const generatedIds = [];

console.log('🌱 Seeding Development Data...');

structure.forEach((item, index) => {
  const dir = path.join(MODELS_DIR, item.folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const id = `model-${index}`;
  generatedIds.push(id);

  // 1. Write Model File
  const modelPath = path.join(dir, `${item.name}.stl`);
  fs.writeFileSync(modelPath, generateCubeSTL(item.name));

  // 2. Write Munchie JSON (Metadata)
  const jsonPath = path.join(dir, `${item.name}-stl-munchie.json`);
  const metadata = {
    id: id,
    name: item.name,
    description: `Auto-generated test model for ${item.folder}`,
    category: item.folder.split('/')[0], // Use top folder as category
    tags: ['test', 'dev', item.type],
    fileSize: 1024,
    printTime: "2h 30m",
    filamentUsed: "50g",
    isPrinted: index % 2 === 0, // Alternate status
    created: new Date().toISOString(),
    lastModified: new Date().toISOString()
  };
  fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
  
  console.log(`✅ Created: ${item.folder}/${item.name}`);
});

// --- 3. Create Nested Collections ---
const collections = [
  {
    id: "col-root-1",
    name: "Favorites",
    description: "My top picks",
    modelIds: [generatedIds[0], generatedIds[1]],
    parentId: null,
    childCollectionIds: []
  },
  {
    id: "col-root-2",
    name: "Projects",
    description: "Ongoing builds",
    modelIds: [],
    parentId: null,
    childCollectionIds: ["col-child-1"]
  },
  {
    id: "col-child-1",
    name: "Sci-Fi Build",
    description: "Nested inside Projects",
    modelIds: [generatedIds[2], generatedIds[3]],
    parentId: "col-root-2", // <--- THE NESTING MAGIC
    childCollectionIds: []
  }
];

const colPath = path.join(DATA_DIR, 'collections.json');
fs.writeFileSync(colPath, JSON.stringify(collections, null, 2));
console.log('✅ Created: Nested Collections Database');

console.log('🚀 Done! Restart your server to see the changes.');
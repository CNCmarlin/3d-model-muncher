const fs = require('fs');
const path = require('path');

const MOVED_COMPONENTS = {
    'ModelCard': 'models/ModelCard',
    'ModelGrid': 'models/ModelGrid',
    'ModelHubView': 'models/ModelHubView',
    'ModelHubView_DB': 'models/ModelHubView_DB',
    'ModelViewer3D': 'models/ModelViewer3D',
    'Grid3DViewer': 'models/Grid3DViewer',
    'ModelMesh': 'models/ModelMesh',
    'ModelUploadDialog': 'models/ModelUploadDialog',
    'ModelPreviewSection': 'models/ModelPreviewSection',

    // Details
    'DescriptionSection': 'models/details/DescriptionSection',
    'DescriptionSection_DB': 'models/details/DescriptionSection_DB',
    'MetadataSection': 'models/details/MetadataSection',
    'NotesSection': 'models/details/NotesSection',
    'NotesSection_DB': 'models/details/NotesSection_DB',
    'GcodeSection': 'models/details/GcodeSection',
    'PrintSettingsSection': 'models/details/PrintSettingsSection',
    'RelatedFilesSection': 'models/details/RelatedFilesSection',
    'SiblingsSection': 'models/details/SiblingsSection',
    'SourceSection': 'models/details/SourceSection',
    'TagsSection': 'models/details/TagsSection',

    // Collections
    'CollectionCard': 'collections/CollectionCard',
    'CollectionGrid': 'collections/CollectionGrid',
    'CollectionListRow': 'collections/CollectionListRow',
    'CollectionEditorDialog': 'collections/CollectionEditorDialog',
    'CollectionEditDrawer': 'collections/CollectionEditDrawer',
    'NestedCollectionEditor': 'collections/NestedCollectionEditor'
};

const SRC_DIR = 'src';

function scanDir(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Skip the moved directories themselves to avoid double-fixing or breaking correct relative imports?
            // Actually, internal imports were fixed by previous script.
            // But we should be careful.
            // If we are in src/components/models, we shouldn't change ./ModelCard to ./models/ModelCard.
            if (fullPath.includes('src\\components\\models') || fullPath.includes('src/components/models')) return;

            scanDir(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            fixImports(fullPath);
        }
    });
}

function fixImports(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Regex to capture import paths
    content = content.replace(/from\s+['"]([^'"]+)['"]/g, (match, importPath) => {
        if (!importPath.startsWith('.')) return match;

        let newPath = importPath;

        // Loop through moved components
        Object.keys(MOVED_COMPONENTS).forEach(compName => {
            // Check if the import path ends with the component name
            // e.g. "./ModelCard" or "../components/ModelCard"

            if (importPath.endsWith('/' + compName) || importPath === './' + compName) {
                const relPath = MOVED_COMPONENTS[compName];

                // SAFETY CHECK: If it already ends with relPath, SKIP
                if (importPath.endsWith(relPath)) return;

                // How to construct new path?
                // If import was "./ModelCard", it meant sibling.
                // New component is at "./models/ModelCard".
                // So replace "ModelCard" with "models/ModelCard".

                // If import was "../components/ModelCard". 
                // New component is "../components/models/ModelCard".
                // Replace "ModelCard" with "models/ModelCard".

                // So generally replacing the filename with the relative path works?
                // Be careful with substrings.

                // Replace last occurrence of CompName with NewPath
                const lastIndex = newPath.lastIndexOf(compName);
                if (lastIndex !== -1) {
                    // Check if it's the end of string
                    if (lastIndex + compName.length === newPath.length) {
                        newPath = newPath.substring(0, lastIndex) + relPath;
                    }
                }
            }
        });

        if (newPath !== importPath) {
            changed = true;
            return `from "${newPath}"`;
        }
        return match;
    });

    if (changed) {
        console.log(`Updated references in ${filePath}`);
        fs.writeFileSync(filePath, content);
    }
}

scanDir(SRC_DIR);

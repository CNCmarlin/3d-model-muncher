const fs = require('fs');
const path = require('path');

const MOVED_TO_MODELS = [
    'ModelCard', 'ModelGrid', 'ModelHubView', 'ModelHubView_DB', 'ModelViewer3D',
    'Grid3DViewer', 'ModelMesh', 'ModelUploadDialog', 'ModelPreviewSection'
];

const MOVED_TO_DETAILS = [
    'DescriptionSection', 'DescriptionSection_DB', 'MetadataSection', 'NotesSection',
    'NotesSection_DB', 'GcodeSection', 'PrintSettingsSection', 'RelatedFilesSection',
    'SiblingsSection', 'SourceSection', 'TagsSection'
];

const MOVED_TO_COLLECTIONS = [
    'CollectionCard', 'CollectionGrid', 'CollectionListRow', 'CollectionView',
    'CollectionView_DB', 'CollectionEditorDialog', 'CollectionEditDrawer', 'NestedCollectionEditor'
];

const TARGET_MODELS = 'src/components/models';
const TARGET_DETAILS = 'src/components/models/details';
const TARGET_COLLECTIONS = 'src/components/collections';

function fixImports(filePath, depth) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    content = content.replace(/from\s+['"]([^'"]+)['"]/g, (match, importPath) => {
        // 1. External libraries (no . or ..) -> Keep
        if (!importPath.startsWith('.')) return match;

        let newPath = importPath;

        // 2. Upward imports (../) -> Add depth
        if (importPath.startsWith('../')) {
            if (depth === 1) newPath = '../' + importPath;
            if (depth === 2) newPath = '../../' + importPath;
        }
        // 3. Sibling imports (./)
        else if (importPath.startsWith('./')) {
            const target = importPath.substring(2);

            // Special Case: ./ui/ -> ../ui/ (or ../../ui/)
            if (importPath.startsWith('./ui/')) {
                if (depth === 1) newPath = '../' + target;
                if (depth === 2) newPath = '../../components/' + target; // Wait, ../../ui works if we assume ui is in components
                // Actually:
                // models/ is depth 1 from components.
                // models/file -> ../ui/ works.
                // models/details/file -> ../../ui/ works.
                if (depth === 1) newPath = '../ui/' + importPath.substring(5);
                if (depth === 2) newPath = '../../ui/' + importPath.substring(5);
            }
            else {
                // Is it a file that WAS moved with us?
                // Clean import path to filename (remove extension logic implied?) import paths don't have ext usually
                const base = target.split('/')[0];

                // Check if this component is in our current folder (Models)
                if (depth === 1) { // In models/
                    if (MOVED_TO_MODELS.includes(base)) {
                        // Sibling -> Sibling. Keep ./
                        newPath = './' + target;
                    } else if (MOVED_TO_DETAILS.includes(base)) {
                        // Sibling -> Child (details/)
                        newPath = './details/' + target;
                    } else {
                        // Sibling -> Parent (stayed in components/)
                        newPath = '../' + target;
                    }
                }
                else if (depth === 2) { // In models/details/
                    // It was ./Something
                    if (MOVED_TO_DETAILS.includes(base)) {
                        // Sibling -> Sibling
                        newPath = './' + target;
                    } else if (MOVED_TO_MODELS.includes(base)) {
                        // Sibling -> Parent (models/)
                        newPath = '../' + target;
                    } else {
                        // Sibling -> Grandparent (components/)
                        newPath = '../../' + target;
                    }
                }
            }
        }

        if (newPath !== importPath) {
            changed = true;
            return `from "${newPath}"`;
        }
        return match;
    });

    if (changed) {
        console.log(`Fixing ${filePath}`);
        fs.writeFileSync(filePath, content);
    }
}

// Process Models
// if (fs.existsSync(TARGET_MODELS)) {
//     fs.readdirSync(TARGET_MODELS).forEach(file => {
//         if (file.endsWith('.tsx') || file.endsWith('.ts')) {
//             fixImports(path.join(TARGET_MODELS, file), 1);
//         }
//     });
// }

// Process Details
// if (fs.existsSync(TARGET_DETAILS)) {
//     fs.readdirSync(TARGET_DETAILS).forEach(file => {
//         if (file.endsWith('.tsx') || file.endsWith('.ts')) {
//             fixImports(path.join(TARGET_DETAILS, file), 2);
//         }
//     });
// }

// Process Collections
if (fs.existsSync(TARGET_COLLECTIONS)) {
    fs.readdirSync(TARGET_COLLECTIONS).forEach(file => {
        if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            fixImports(path.join(TARGET_COLLECTIONS, file), 1);
        }
    });
}

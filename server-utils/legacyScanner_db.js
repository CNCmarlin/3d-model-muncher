const fs = require('fs');
const path = require('path');

/**
 * recursive scan for models to build a list
 * @param {string} directory - root directory to scan
 * @param {string} rootPath - absolute path to models root (for relative path calculation)
 * @returns {Array} List of model objects
 */
function scanForModels(directory, rootPath) {
    let models = [];
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            models = models.concat(scanForModels(fullPath, rootPath));
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
            try {
                const fileContent = fs.readFileSync(fullPath, 'utf8');
                const model = JSON.parse(fileContent);
                const relativePath = path.relative(rootPath, fullPath);
                let modelUrl, filePath;

                if (entry.name.endsWith('-stl-munchie.json')) {
                    const baseFilePath = relativePath.replace('-stl-munchie.json', '');
                    let stlFilePath = baseFilePath + '.stl';
                    let absoluteStlPath = path.join(rootPath, stlFilePath);
                    if (!fs.existsSync(absoluteStlPath)) {
                        stlFilePath = baseFilePath + '.STL';
                        absoluteStlPath = path.join(rootPath, stlFilePath);
                    }
                    if (fs.existsSync(absoluteStlPath)) {
                        modelUrl = '/models/' + stlFilePath.replace(/\\/g, '/');
                        filePath = stlFilePath;
                        model.modelUrl = modelUrl;
                        model.filePath = filePath;
                        models.push(model);
                    }
                } else {
                    const threeMfFilePath = relativePath.replace('-munchie.json', '.3mf');
                    const absoluteThreeMfPath = path.join(rootPath, threeMfFilePath);
                    if (fs.existsSync(absoluteThreeMfPath)) {
                        modelUrl = '/models/' + threeMfFilePath.replace(/\\/g, '/');
                        filePath = threeMfFilePath;
                        model.modelUrl = modelUrl;
                        model.filePath = filePath;
                        models.push(model);
                    }
                }
            } catch (error) {
                console.error(`Error reading model file ${fullPath}:`, error);
            }
        }
    }
    return models;
}

module.exports = { scanForModels };

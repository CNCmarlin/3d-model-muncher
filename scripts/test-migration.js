const LegacySourceScanner = require('../server-utils/LegacySourceScanner');
const path = require('path');

async function test() {
    const fixturePath = path.join(__dirname, '../tests/fixtures/migration_data');
    console.log('--- Testing Legacy Source Scanner ---');
    console.log('Fixture Path:', fixturePath);

    const scanner = new LegacySourceScanner(fixturePath);
    const entities = await scanner.scan();

    console.log(`\nFound ${entities.length} entities.`);

    entities.forEach(e => {
        console.log(`\n[${e.type}] ${e.name} (${e.id})`);
        console.log(`  -> isHidden: ${e.mapped.isHidden}`);
        console.log(`  -> isComponent: ${e.mapped.isComponent}`);
        console.log(`  -> printTime: ${e.mapped.printTime}s (Raw: "${e.data.printTime}")`);
        console.log(`  -> filament: ${e.mapped.filamentUsage}g (Raw: "${e.data.filamentUsed}")`);
        if (e.parentId) console.log(`  -> Parent: ${e.parentId}`);
        if (e.warnings.length > 0) console.log(`  -> WARNINGS: ${e.warnings.join(', ')}`);
    });
}

test();

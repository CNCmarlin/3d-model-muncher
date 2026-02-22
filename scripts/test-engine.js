const MigrationEngine = require('../server-utils/MigrationEngine');
const path = require('path');

async function testEngine() {
    console.log('--- Testing Migration Engine ---');
    try {
        // Instantiate the engine
        const engine = new MigrationEngine();

        // Override modelsDir to point to fixtures for safety/speed
        const fixturePath = path.join(__dirname, '../tests/fixtures/migration_data');
        engine.modelsDir = fixturePath;
        engine.scanner.modelsDir = fixturePath;

        // Run Dry Run
        console.log('Running Dry Run...');
        const stats = await engine.run(true);

        console.log('\n--- Success ---');
        console.log(JSON.stringify(stats, null, 2));

    } catch (e) {
        console.error('\n--- CRASH ---');
        console.error(e);
        process.exit(1);
    }
}

testEngine();

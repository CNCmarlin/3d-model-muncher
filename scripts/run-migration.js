const MigrationEngine = require('../server-utils/MigrationEngine');
const path = require('path');

async function runMigration() {
    console.log('--- 🚀 Starting Full Migration ---');
    console.log('Using Fixed MigrationEngine...');

    try {
        const engine = new MigrationEngine();

        // Ensure we are using real paths (MigrationEngine constructor sets them)
        console.log(`Models Directory: ${engine.modelsDir}`);
        console.log(`Error Log: ${engine.errorLogPath}`);

        // Run in REAL mode (dryRun = false)
        // User can change this to true if they want to test first
        const DRY_RUN = false;

        console.log(`Executing Migration (DryRun: ${DRY_RUN})...`);
        const stats = await engine.run(DRY_RUN);

        console.log('\n--- ✅ Migration Complete ---');
        console.log('Summary:', JSON.stringify(stats.summary, null, 2));
        console.log('\nCheck migration_errors.log for details.');

    } catch (e) {
        console.error('\n--- ❌ Migration Failed ---');
        console.error(e);
        process.exit(1);
    }
}

runMigration();

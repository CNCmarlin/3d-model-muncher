const fetch = require('node-fetch');
const prisma = require('./server-utils/db.js');

async function test() {
    // 1. Find a primary model that has related files
    const primary = await prisma.model.findFirst({
        where: { relatedFiles: { some: {} } },
        include: { relatedFiles: true }
    });

    if (!primary) {
        console.log("No related files found anywhere.");
        return;
    }

    console.log(`Found primary model: ${primary.name}`);
    console.log(`Related Files:`, primary.relatedFiles.map(rf => rf.path));

    const rfPath = primary.relatedFiles[0].path;
    const searchPath = rfPath.startsWith('/models/') ? rfPath : `/models/${rfPath}`;

    console.log(`\nTesting fuzzy lookup (/api/models?modelUrl=${searchPath}):`);
    const fuzzyResp = await fetch(`http://127.0.0.1:3001/api/models?modelUrl=${encodeURIComponent(searchPath)}`);
    const fuzzyData = await fuzzyResp.json();
    console.log(`Fuzzy returned ${fuzzyData.data ? fuzzyData.data.length : 0} items. First ID: ${fuzzyData.data?.[0]?.id}, Name: ${fuzzyData.data?.[0]?.name}`);

    console.log(`\nTesting exact lookup (/api/models?modelUrl=${searchPath}&exactUrl=true):`);
    const exactResp = await fetch(`http://127.0.0.1:3001/api/models?modelUrl=${encodeURIComponent(searchPath)}&exactUrl=true`);
    const exactData = await exactResp.json();
    console.log(`Exact returned ${exactData.data ? exactData.data.length : 0} items. First ID: ${exactData.data?.[0]?.id}, Name: ${exactData.data?.[0]?.name}`);

    if (exactData.data?.[0]) {
        console.log("Exact thumbnail raw:", exactData.data[0].thumbnailPath);
        console.log("Exact Model Images:", exactData.data[0].images);
    }
}

test().catch(console.error).finally(() => process.exit(0));

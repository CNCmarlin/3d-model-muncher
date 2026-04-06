const prisma = require('./server-utils/db');
async function run() {
    // 1. Find the ADXL collection and its full model detail
    const adxlCol = await prisma.collection.findFirst({
        where: { name: 'ADXL' },
        include: {
            models: {
                include: {
                    relatedFiles: true,
                    images: true,
                    _count: { select: { relatedFiles: true } }
                }
            }
        }
    });

    console.log('=== ADXL Collection ===');
    if (!adxlCol) { console.log('NOT FOUND'); }
    else {
        console.log('isModelFolder:', adxlCol.isModelFolder, ' type:', adxlCol.type);
        adxlCol.models.forEach(m => {
            const flags = [m.isMainModel && 'MAIN', m.isComponent && 'COMP', m.isHidden && 'HIDDEN'].filter(Boolean).join(' ');
            console.log('  [' + (flags || 'normal') + '] "' + m.name + '"  relatedFiles=' + m._count.relatedFiles);
        });
    }

    // 2. Check c270_cam1 cross-linking
    const cam1 = await prisma.model.findFirst({
        where: { name: 'c270_cam1' },
        include: {
            relatedFiles: true,
            images: { select: { id: true, path: true, source: true } },
            _count: { select: { relatedFiles: true } }
        }
    });
    console.log('\n=== c270_cam1 (C-270 tripod primary) ===');
    if (!cam1) { console.log('NOT FOUND'); }
    else {
        const flags = [cam1.isMainModel && 'MAIN', cam1.isComponent && 'COMP', cam1.isHidden && 'HIDDEN'].filter(Boolean).join(' ');
        console.log('flags:', flags || 'normal');
        console.log('relatedFiles:', cam1._count.relatedFiles);
        console.log('images:', cam1.images.length, '(crosslink:', cam1.images.filter(i => i.source === 'crosslink').length + ')');
        cam1.relatedFiles.slice(0, 8).forEach(rf => console.log('  rf:', rf.path));
    }

    await prisma.$disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });

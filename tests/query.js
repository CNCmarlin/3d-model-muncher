const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findCandidates() {
    // Find all models that are marked as Main Models but are currently NOT hidden
    const candidates = await prisma.model.findMany({
        where: { 
            isMainModel: true,
            isHidden: false
        },
        select: {
            id: true,
            name: true,
            collectionId: true
        }
    });
    
    console.log("Found", candidates.length, "candidates that might need to be hidden:");
    console.log(JSON.stringify(candidates, null, 2));
    
    await prisma.$disconnect();
}

findCandidates();

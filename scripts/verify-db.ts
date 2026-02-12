import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const models = await prisma.model.count();
    const files = await prisma.modelFile.count();
    const collections = await prisma.collection.count();

    console.log('------------------------------------------------');
    console.log('✅ DATABASE VERIFICATION');
    console.log('------------------------------------------------');
    console.log(`Models:      ${models}`);
    console.log(`Files:       ${files}`);
    console.log(`Collections: ${collections}`);
    console.log('------------------------------------------------');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

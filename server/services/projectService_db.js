const db = require('../../server-utils/db');

/**
 * Service to manage Projects, Staging Items, and Build Plates.
 */

class ProjectService {
    async getAllProjects() {
        return await db.project.findMany({
            include: {
                _count: {
                    select: { buildPlates: true, items: true }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
    }

    async getProjectById(projectId) {
        return await db.project.findUnique({
            where: { id: projectId },
            include: {
                buildPlates: {
                    include: {
                        items: {
                            include: {
                                projectItem: {
                                    include: {
                                        model: {
                                            include: {
                                                files: { where: { isPrimary: true } }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { order: 'asc' }
                },
                items: {
                    include: {
                        model: {
                            include: {
                                files: { where: { isPrimary: true } }
                            }
                        }
                    }
                }
            }
        });
    }

    async createProject(data) {
        return await db.project.create({
            data: {
                name: data.name,
                description: data.description,
                status: data.status || 'Planning'
            }
        });
    }

    async deleteProject(projectId) {
        return await db.project.delete({
            where: { id: projectId }
        });
    }

    // --- Build Plates ---

    async createBuildPlate(projectId, data) {
        return await db.buildPlate.create({
            data: {
                projectId,
                name: data.name,
                status: data.status || 'Draft',
                order: data.order || 0,
                width: data.width,
                height: data.height,
                customName: data.customName
            }
        });
    }

    async updateBuildPlate(plateId, data) {
        return await db.buildPlate.update({
            where: { id: plateId },
            data: {
                name: data.name,
                status: data.status,
                printerAssigned: data.printerAssigned,
                materialRequired: data.materialRequired,
                order: data.order,
                width: data.width,
                height: data.height,
                customName: data.customName
            }
        });
    }

    async deleteBuildPlate(plateId) {
        // If we delete a build plate, we need to return the assigned quantities back to the Unassigned Pool
        // Prisma cascade deletes the BuildPlateItems, but it won't trigger our custom quantity logic.
        // So we must handle it manually in a specific order:

        const plateItems = await db.buildPlateItem.findMany({
            where: { buildPlateId: plateId }
        });

        // Use transaction to ensure data integrity
        return await db.$transaction(async (tx) => {
            for (const item of plateItems) {
                await tx.projectItem.update({
                    where: { id: item.projectItemId },
                    data: {
                        quantityAssigned: { decrement: item.quantity }
                    }
                });
            }

            return await tx.buildPlate.delete({
                where: { id: plateId }
            });
        });
    }

    // --- Project Items (Staging Area) ---

    async stageModelsToProject(projectId, modelIds, quantityDesired = 1) {
        // Bulk assign multiple models to a project's staging area
        // Upsert logic: if it exists, increment desired quantity. If not, create.
        const results = [];

        await db.$transaction(async (tx) => {
            for (const modelId of modelIds) {
                const existing = await tx.projectItem.findUnique({
                    where: {
                        projectId_modelId: { projectId, modelId }
                    }
                });

                if (existing) {
                    results.push(await tx.projectItem.update({
                        where: { id: existing.id },
                        data: { quantityDesired: { increment: quantityDesired } }
                    }));
                } else {
                    results.push(await tx.projectItem.create({
                        data: {
                            projectId,
                            modelId,
                            quantityDesired,
                            quantityAssigned: 0
                        }
                    }));
                }
            }
        });

        return results;
    }

    async removeProjectItem(projectItemId) {
        // This will cascade and delete BuildPlateItems under it.
        return await db.projectItem.delete({
            where: { id: projectItemId }
        });
    }

    // --- Assignments (Drag and Drop Action) ---

    async assignItemToPlate(buildPlateId, projectItemId, quantity = 1) {
        // 1. Check if the projectItem exists and has enough unassigned quantity
        const stagingItem = await db.projectItem.findUnique({ where: { id: projectItemId } });
        if (!stagingItem) throw new Error("Staging item not found");

        const available = stagingItem.quantityDesired - stagingItem.quantityAssigned;
        if (available < quantity) {
            throw new Error(`Cannot assign ${quantity}. Only ${available} available unassigned.`);
        }

        return await db.$transaction(async (tx) => {
            // Check if already on this specific plate
            const existingOnPlate = await tx.buildPlateItem.findFirst({
                where: { buildPlateId, projectItemId }
            });

            let assignedResult;
            if (existingOnPlate) {
                assignedResult = await tx.buildPlateItem.update({
                    where: { id: existingOnPlate.id },
                    data: { quantity: { increment: quantity } }
                });
            } else {
                assignedResult = await tx.buildPlateItem.create({
                    data: {
                        buildPlateId,
                        projectItemId,
                        quantity
                    }
                });
            }

            // Update parent quantityAssigned
            await tx.projectItem.update({
                where: { id: projectItemId },
                data: { quantityAssigned: { increment: quantity } }
            });

            return assignedResult;
        });
    }

    async unassignItemFromPlate(buildPlateItemId) {
        return await db.$transaction(async (tx) => {
            const item = await tx.buildPlateItem.findUnique({ where: { id: buildPlateItemId } });
            if (!item) return null;

            // Reduce assignment count
            await tx.projectItem.update({
                where: { id: item.projectItemId },
                data: { quantityAssigned: { decrement: item.quantity } }
            });

            return await tx.buildPlateItem.delete({
                where: { id: buildPlateItemId }
            });
        });
    }
}

module.exports = new ProjectService();

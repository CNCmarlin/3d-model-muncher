-- AlterTable
ALTER TABLE "models" ADD COLUMN "designer" TEXT;

-- CreateIndex
CREATE INDEX "models_collection_id_idx" ON "models"("collection_id");

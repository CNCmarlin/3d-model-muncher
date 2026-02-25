/*
  Warnings:

  - You are about to drop the column `cover_image_path` on the `models` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_models" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "license" TEXT,
    "designer" TEXT,
    "print_time_seconds" INTEGER,
    "filament_usage_grams" REAL,
    "is_printed" BOOLEAN NOT NULL DEFAULT false,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_component" BOOLEAN NOT NULL DEFAULT false,
    "path_hash" TEXT,
    "thumbnail_path" TEXT,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "models_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_models" ("collection_id", "created_at", "description", "designer", "filament_usage_grams", "id", "is_component", "is_deleted", "is_favorite", "is_hidden", "is_printed", "license", "metadata_json", "name", "path_hash", "print_time_seconds", "updated_at", "thumbnail_path") SELECT "collection_id", "created_at", "description", "designer", "filament_usage_grams", "id", "is_component", "is_deleted", "is_favorite", "is_hidden", "is_printed", "license", "metadata_json", "name", "path_hash", "print_time_seconds", "updated_at", "cover_image_path" FROM "models";
DROP TABLE "models";
ALTER TABLE "new_models" RENAME TO "models";
CREATE UNIQUE INDEX "models_path_hash_key" ON "models"("path_hash");
CREATE INDEX "models_collection_id_idx" ON "models"("collection_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

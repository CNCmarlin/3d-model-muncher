-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "path_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "cover_image_path" TEXT,
    "metadata_json" TEXT,
    "type" TEXT NOT NULL DEFAULT 'folder',
    "category" TEXT,
    CONSTRAINT "collections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_collections" ("cover_image_path", "created_at", "id", "name", "parent_id", "path_hash", "updated_at") SELECT "cover_image_path", "created_at", "id", "name", "parent_id", "path_hash", "updated_at" FROM "collections";
DROP TABLE "collections";
ALTER TABLE "new_collections" RENAME TO "collections";
CREATE UNIQUE INDEX "collections_path_hash_key" ON "collections"("path_hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

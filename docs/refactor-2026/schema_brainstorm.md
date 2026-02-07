# Database Schema Brainstorming & Term Definitions

## 📚 Core Terms (The "Language" of the DB)
*(See previous section for definitions of Collection, Model, ModelFile)*

---

## 🔄 The Auto-Collection Redesign
> *"How would the auto collection system have to be rethought for this to work?"*

Currently, `collectionScanner.js` rebuilds the world from scratch on every boot by walking the folder tree.

In a Database world, the "Scanner" changes roles from **Building State** to **Syncing State**.
It becomes an **Ingestor** that runs on file changes (Watch Mode) or on demand.

### 1. The "Path-Based" Logic
Instead of recursive complexity, we use the file path itself to determine the collection hierarchy.

**Example Path**: `models/Vehicles/Cars/Sports/Ferrari.stl`

**Old Way**:
1. Scan `models/` -> Create Collection "Vehicles"
2. Scan inside -> Create Collection "Cars"
3. Scan inside -> Create Collection "Sports"
4. Find `Ferrari.stl` -> Create Model.

**New Way (The Ingestor)**:
When `Ferrari.stl` appears (or is scanned):
1.  **Split Path**: `["Vehicles", "Cars", "Sports"]`
2.  **Ensure Collections Exist** (Upsert):
    *   Does "Vehicles" exist? No? -> `INSERT INTO collections (name, parent_id=NULL)` -> ID 1.
    *   Does "Cars" exist under ID 1? No? -> `INSERT INTO collections (name, parent_id=1)` -> ID 2.
    *   Does "Sports" exist under ID 2? No? -> `INSERT INTO collections (name, parent_id=2)` -> ID 3.
3.  **Insert Model**:
    *   `INSERT INTO models (name="Ferrari", collection_id=3)` -> ID 100.
4.  **Insert File**:
    *   `INSERT INTO model_files (model_id=100, filename="Ferrari.stl")`.

### 2. Handling "Project Folders" (Thingiverse Style)
**Example Path**: `models/SciFi/Robots/CoolBot_Project/` containing `head.stl` and `body.stl`.

**The Detection Logic**:
The Ingestor sees a folder `CoolBot_Project` with multiple files.
1.  **Heuristic Check**: Does it contain `project.json`? Or assume "Leaf Folder with multiple 3D files = Model"?
    *   *Decision Point*: We can keep the `project.json` marker OR make it smart (Leaf Node = Model).
2.  **Action**:
    *   Create **Collection** "SciFi" -> "Robots".
    *   Create **Model** "CoolBot_Project" (inside "Robots").
    *   Create **ModelFiles** `head.stl`, `body.stl` linked to "CoolBot_Project".

### 3. Killing the `project.json` Dependency 🚀
> *"project.json would still need to physically exist in the folder for the system to work?"*

**NO.** With a database, we can graduate from "File Markers" to "Database Truth".

**The New "Model Edge Case" Solution**:
1.  **Import Time**: The Ingestor sees a folder with multiple STL/3MF files.
    *   **Rule**: "If a leaf folder contains multiple geometry files, assume it is a PROJECT."
    *   It creates a **Model Record** with `type='project'` and `path='models/SciFi/Robots/CoolBot_Project'`.
2.  **Runtime**: The Frontend asks the Database "What is at this path?".
    *   Database says: "That exists as a Model ID 55."
    *   Frontend renders a Model Card.
3.  **Result**: You can delete `project.json` entirely. The Database *remembers* that this folder is a Model, not a Collection.

### 4. Handling Uploads & "Mixed Bags" (User Rules)
**Rule A: The Upload Dialog is King**
*   When uploading via UI, the user checks "Upload as Single Model".
*   **Result**: The API immediately inserts `type='model'` into the DB. No "friction" or post-upload badge needed.

**Rule B: The "Safety Net" (Mixed Bag Prevention)**
> *"We would probable design against letting this exact situation happen at all."*
*   **Scenario**: User tries to promote `Vehicles/` (which contains `Cars/` and `Trucks/`).
*   **The Check**: The system **BLOCKS** promotion if the folder contains sub-directories (collections).
*   **Error Message**: "Cannot convert to Model: This folder contains sub-collections. Move them out first."
*   **Result**: A Model is guaranteed to be a "Leaf Node" structure (Files + Assets only).

---

## 🏗️ The Schema Proposal (Draft v1)

Here is the SQL structure that enforces these rules.

### 1. `collections`
*Folders that contain other things.*
```sql
CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER, -- NULL if root
  path_hash TEXT UNIQUE, -- Fast lookup by folder path
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent_id) REFERENCES collections(id) ON DELETE CASCADE
);
```

### 2. `models`
*The conceptual "Item" (Project or Single File).*
```sql
CREATE TABLE models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  
  -- Metadata
  description TEXT,
  license TEXT,
  print_time_seconds INTEGER,
  filament_usage_grams REAL,
  
  -- Organization
  is_printed BOOLEAN DEFAULT 0,
  is_favorite BOOLEAN DEFAULT 0,
  
  -- Navigation
  path_hash TEXT UNIQUE, -- To link to the folder on disk
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
);
```

### 3. `model_files`
*The actual .stl/.3mf files.*
```sql
CREATE TABLE model_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  
  filename TEXT NOT NULL, -- "head.stl"
  file_path TEXT NOT NULL, -- Relative path for streaming
  size_bytes INTEGER,
  
  -- Function
  is_primary BOOLEAN DEFAULT 0, -- The "Main" file
  is_supported BOOLEAN DEFAULT 0, -- Pre-supported version?
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE
);
```

### 4. `model_tags`
*Replacing the messy array in JSON.*
```sql
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
CREATE TABLE model_tags (
  model_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY(model_id, tag_id),
  FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE
);
```

## 🧪 The "Thingiverse Test"
**Verdict: YES.**
The "Thingiverse Problem" is actually just a **One-to-Many Relationship** (One Model has Many Files).
*   **Filesystem**: Bad at One-to-Many (Folders are vague).
*   **Sidecar JSON**: Terrible at One-to-Many (Requires hacks like `hidden:true`).
*   **Relational DB**: **Designed** for One-to-Many. It is the native language of databases.

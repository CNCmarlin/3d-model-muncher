# 3D Model Muncher - Feature Rundown

This document provides a comprehensive overview of the application's capabilities, derived from the codebase and development history.

## 📚 Library Management
*   **Nested Collections**: Create valid directory-based collections or virtual collections. Supports deep nesting (Collections within Collections).
*   **Smart Filtering**:
    *   **Filters**: Category, Tags, Print Status (Printed/Not Printed), License, File Type (STL/3MF).
    *   **Advanced Search**: Real-time filtering by name, path, or tags. Includes "Show Hidden" toggle.
*   **Metadata Management**:
    *   **Sidecar JSON**: Non-destructive metadata storage (`*-munchie.json`) keeps original files untouched.
    *   **Bulk Editing**: Select multiple models to batch-update keys, categories, or tags.
    *   **Tag Autocomplete**: Intelligent tag suggestions based on your existing library.

## 👁️ Visualization & Preview
*   **Interactive 3D Viewer**:
    *   Native support for **STL** and **3MF** files using Three.js.
    *   Orbit controls, zoom, and auto-rotation.
    *   **3MF Components**: Toggle visibility of individual objects within a 3MF assembly.
*   **Automated Thumbnails**:
    *   Uses a headless browser (Puppeteer) to render perfect screenshots of 3D files.
    *   **Cover Images**: Auto-selects the best image for collection covers.
*   **Theming**:
    *   **Dynamic HSL Theme**: Engine generates accessible Dark/Light modes from a single user-selected primary color.
    *   Responsive Grid/List layouts.

## 🤖 AI & Automation
*   **Google Gemini Integration**:
    *   **Auto-Tagging**: Generates relevant tags based on filename and images.
    *   **Smart Categorization**: Suggests the best category for uncategorized models.
    *   **Description Generation**: writes human-readable descriptions for models.
*   **File Scanner**:
    *   **Watch Mode**: backend detects new files dropped into the `models/` directory.
    *   **3MF parsing**: Extracts separate model geometry and metadata from 3MF containers.

## 🖨️ Printing & Hardware
*   **G-Code Analysis**:
    *   Parses uploaded/scanned G-code (`.gcode`) to extract:
        *   **Print Time** estimation.
        *   **Filament Usage** (length/weight).
        *   **Layer Count** and dimensions.
*   **Spoolman Integration**:
    *   Connects to external Spoolman instance.
    *   Tracks filament inventory against G-code usage.
*   **Printer Status Hub**:
    *   Visual dashboard in the header monitoring connected 3D printers.

## 🛠️ Advanced Tools
*   **File Integrity**:
    *   **Hash Check**: Verifies file content against stored hashes to detect bit-rot.
    *   **Missing Image Finder**: Locates models without preview images.
*   **Import/Upload**:
    *   **Web Upload**: Drag-and-drop files directly into specific collections.
    *   **Folder Inference**: Smartly guesses the target folder based on existing collection contents.
*   **System**:
    *   **Docker Native**: Optimized for containerized deployment (Unraid/Debian).
    *   **Backup/Restore**: Export configuration and collection hierarchy to JSON.

## 🧪 Experimental Features (Beta)
*   **Related Files**: Link multiple models or files together (e.g. "Project V2" linked to "Project V1").
*   **Collection Sort**: Custom sort orders for collection items.

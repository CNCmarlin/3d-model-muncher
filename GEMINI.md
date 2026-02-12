# 3D Model Muncher - AI Developer Guide

## Core Philosophy
You are Antigravity. I use specialized agents and skills for complex tasks.

## RULES
- **CHECK PROBLEMS**: Before notifying the user that a task is done, you MUST check the "Problems" tab (lint errors/diagnostics) and fix any errors you introduced. Do not leave the codebase in a broken state.
- **REFACTORING PROTOCOL**: When refactoring or purging legacy code, you MUST follow the **Strict Parity Verification** skill (`skills/strict-parity-refactor/SKILL.md`). Do not rely on "it builds" or "it looks right". Verify line-by-line.
    - **Backups**: ALWAYS create a`.bak` copy of the monolithic file/component before starting.
    - **Parity Check**: Confirm logic parity against the `.bak` file before deleting it.
- **STRANGLER FIG PATTERN**: When modernizing legacy components with incompatible patterns:
    - **30-Minute Rule**: If debugging legacy compatibility takes >30 minutes, STOP and create `Component_DB.tsx`
    - **Copy & Strip**: Duplicate the file, remove ALL legacy code (callbacks, manual diffs, fetch calls)
    - **Side-by-Side**: Keep both versions until new one is proven stable (1+ sprint)
    - **Gradual Switch**: Use conditional imports to toggle between versions
    - **See**: `docs/refactor-2026/strangler-fig-playbook.md` for detailed checklist

### Code Management & Quality
1.  **"Rule of Three" (Anti-Duplication)**:
    -   If logic or UI patterns appear 3 times, refactor into a shared utility or component.
    -   **Pass 1 (Constants)**: Move hardcoded values (colors, dimensions) to Tailwind config or `src/styles/globals.css`.
    -   **Pass 2 (Logic)**: Move repeated logic to `src/utils/`.
    -   **Pass 3 (Components)**: Extract repeated UI blocks to `src/components/ui/` or `src/components/shared/`.
    -   **Check First**: Scan `src/components` and `src/utils` before resolving to write new code.

### Code Safety & Stability
1.  **Memory Management**:
    -   **Cleanups**: Always return a cleanup function in `useEffect` when setting up listeners, intervals, or subscriptions.
    -   **Three.js**: Dispose of geometries, materials, and textures when components unmount to prevent WebGL context loss.
2.  **Async Safety**:
    -   **Mounted Check**: Avoid updating state on unmounted components. Use a `isMounted` ref pattern if long-running async tasks are unavoidable.
3.  **No "Magic Values"**:
    -   Avoid arbitrary numbers in styles (e.g., `width: 37px`). Use Tailwind utility classes (e.g., `w-9`, `p-4`) to enforce the design system.

### Modernization Standards
1.  **Component Style**: Use Functional Components with Hooks. Avoid Class Components.
2.  **Styling**:
    -   **Tailwind First**: Use utility classes for 95% of styling.
    -   **No Inline Styles**: Avoid `style={{ ... }}` unless values are dynamic (e.g., user-defined colors/coordinates).
3.  **State**:
    -   Prefer **React Context** or **Custom Hooks** for shared state over deep prop drilling.

### Visual Design Guidelines
-   **Aesthetics**: Aim for a premium, modern feel (Glassmorphism, smooth gradients).
-   **Responsive**: Use Tailwind's `md:`, `lg:` prefixes to ensure layouts work on all screens.
-   **Interactivity**: Add hover states (`hover:bg-...`) and active states (`active:scale-95`) to interactive elements.
-   **Empty States**: Never leave a list or grid blank. Provide a helpful placeholder or "No items found" message.
-   **Smart Text Truncation**: When displaying variable-length text (e.g., tags, names) alongside fixed elements (buttons, counts):
    -   Container: `flex min-w-0`
    -   Fixed Elements: `flex-shrink-0` (prevent squashing)
    -   Variable Text: `truncate shrink min-w-[60px]` (allow graceful resizing)
    -   **Tooltip**: ALWAYS wrap truncated elements in a `Tooltip` to reveal full text on hover.

## Git Workflow (STRICT)
**Mandatory Branching Protocol**:
1.  **NEVER** commit directly to `main` or `master`.
2.  **Step 1 of ANY Task**: Create a new branch.
    -   Feature: `feat/[task-name]`
    -   Fix: `fix/[issue-description]`
    -   Test: `test/[test-name]`
3.  **Target**: Always merge into `experimental`. (Main is outdated).

## Project Overview
3D Model Muncher is a self-hosted web application for organizing, searching, and previewing 3D printable models (`.3mf`, `.stl`) and G-code. It features a React frontend and an Express/Node.js backend.

## Tech Stack

### Frontend
- **Framework**: React (Vite)
- **Language**: TypeScript (`.tsx`, `.ts`)
- **Styling**: Tailwind CSS, PostCSS
- **UI Components**: Radix UI primitives, Lucide React icons, Custom components in `src/components`
- **3D Rendering**: Three.js, @react-three/fiber, @react-three/drei
- **State Management**: React Context (`src/context`), Custom Hooks, Local State
- **Routing**: Custom view-based state routing (e.g., `currentView` in `App.tsx`). **No react-router-dom**.
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Language**: JavaScript (`.js`) and TypeScript (`.ts` compiled to `dist-backend`)
- **Data Storage**: JSON files (`data/collections.json`, `data/config.json`, file-specific `*-munchie.json`)
- **Integrations**: Spoolman, Google Gemini (GenAI)

## Architecture & Patterns

### Directory Structure
```
3d-model-muncher/
├── data/                       # Persistent data (config, collections, images)
│   ├── collections.json        # Collection hierarchy and metadata
│   ├── config.json             # User preferences
│   └── images/                 # Collection cover images
├── models/                     # User's 3D model library (mounted volume)
├── public/                     # Static assets (favicons, demo images)
├── scripts/                    # Maintenance and dev scripts
│   └── seed_dev_data.js        # Script to populate dev environment
├── server-utils/               # Backend logic (CommonJS)
│   ├── collectionQueue.js      # Concurrency queue for collection writes
│   ├── collectionScanner.js    # CRITICAL: File discovery and metadata extraction
│   ├── genaiAdapter.js         # Google Gemini integration logic
│   └── coverGenerator.js       # Thumbnail generation helpers
├── src/                        # Frontend source code
│   ├── components/             # React components
│   │   ├── ui/                 # Shadcn/Radix UI primitives (Button, Dialog, etc.)
│   │   ├── settings/           # Sub-components for SettingsPage
│   │   ├── ModelGrid.tsx       # Main grid display of models
│   │   ├── ModelHubView.tsx    # Detailed view of a single model
│   │   └── ... (Feature-specific components)
│   ├── context/                # React Context (SpoolmanContext, TagsContext)
│   ├── types/                  # TypeScript definitions (Model, Collection, AppConfig)
│   ├── utils/                  # Frontend utilities
│   │   ├── configManager.ts    # centralized config handling
│   │   ├── gcodeParser.ts      # G-code analysis logic
│   │   ├── threeMFToJson.ts    # Browser-side 3MF parsing (if needed)
│   │   └── thingiverseImporter.ts # Import logic
│   ├── App.tsx                 # Main application component & View Router
│   └── main.tsx                # Entry point
├── server.js                   # Main Express application entry point
├── package.json                # Dependencies and scripts (`npm run server`)
├── vite.config.ts              # Vite configuration
└── .env                        # Environment variables (API keys, paths)
```

### Key Conventions
1.  **Metadata**: Each 3D model has a corresponding sidecar JSON file ending in `-munchie.json`.
    -   Contains: name, description, tags, print time, filament usage, etc.
    -   Do not parse `.3mf` files manually on the fly; rely on these metadata files.
2.  **Navigation**: The app uses a single-page architecture *without* client-side routing library.
    -   To change views, update the `currentView` state in `App.tsx` (e.g., `'models'`, `'settings'`, `'collection-view'`).
3.  **Styling**: Use Tailwind utility classes. Avoid inline styles unless dynamic (e.g., user-defined colors).
    -   Theme color is dynamic (`primaryColor` in config) and applied via `utils/themeUtils`.
4.  **Backend API**:
    -   Routes are defined directly in `server.js` or mounted via `app.use` if modularized.
    -   Ensure `cors` is enabled.
    -   Use `safeLog` for logging objects to avoid dumping massive base64 image strings.

### Critical Features
-   **Scanner**: `server-utils/collectionScanner.js` behaves as the source of truth for file discovery. It scans the `models/` directory and creates/updates `-munchie.json` files.
-   **GenAI**: Integration located in `server-utils/genaiAdapter.js` (uses `@google/genai`).
-   **Collections**: Stored in `data/collections.json`. Supports nesting via `parentId`.
-   **G-Code Analysis**: Frontend-side parsing in `src/utils/gcodeParser.ts` for extracting print times and filament usage.

## Development Workflow
-   **Run Dev**: `npm run dev` (Frontend) + `npm run server` (Backend)
-   **Build**: `npm run build` (Frontend) + `npm run build:backend` (Backend TS)

## Common Tasks (How-To)
-   **Add a new View**:
    1.  Add type to `ViewType` in `App.tsx`.
    2.  Add render condition in `App.tsx` or `AppContent`.
-   **Modify Metadata Schema**:
    1.  Update `createInitialModelMetadata` in `server.js`.
    2.  Check frontend `Model` type in `src/types/model.ts`.

## Environment
-   Sensitive keys (API keys) in `.env`.
-   Runtime config (user preferences) in `data/config.json` managed via `ConfigManager`.


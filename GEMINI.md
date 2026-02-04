# 3D Model Muncher - AI Developer Guide

## Core Philosophy
You are Antigravity. I use specialized agents and skills for complex tasks.

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

## Core Development Rules

These guidelines promote code quality, safety, and consistency.

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

# Agent Orchestration

## Available Agents

Located in `~/.gemini/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth.ts
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utils.ts

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate:

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return {
    ...user,
    name
  }
}
```

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large components
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

## Input Validation

ALWAYS validate user input:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No console.log statements
- [ ] No hardcoded values
- [ ] No mutation (immutable patterns used)

# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.gemini/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## Feature Implementation Workflow

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format

# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

## Current Hooks (in ~/.gemini/settings.json)

### PreToolUse
- **tmux reminder**: Suggests tmux for long-running commands (npm, pnpm, yarn, cargo, etc.)
- **git push review**: Opens Zed for review before push
- **doc blocker**: Blocks creation of unnecessary .md/.txt files

### PostToolUse
- **PR creation**: Logs PR URL and GitHub Actions status
- **Prettier**: Auto-formats JS/TS files after edit
- **TypeScript check**: Runs tsc after editing .ts/.tsx files
- **console.log warning**: Warns about console.log in edited files

### Stop
- **console.log audit**: Checks all modified files for console.log before session ends

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag
- Configure `allowedTools` in `~/.gemini/config.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements

# Common Patterns

## API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
```

## Custom Hooks Pattern

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
```

## Repository Pattern

```typescript
interface Repository<T> {
  findAll(filters?: Filters): Promise<T[]>
  findById(id: string): Promise<T | null>
  create(data: CreateDto): Promise<T>
  update(id: string, data: UpdateDto): Promise<T>
  delete(id: string): Promise<void>
}
```

## Skeleton Projects

When implementing new functionality:
1. Search for battle-tested skeleton projects
2. Use parallel agents to evaluate options:
   - Security assessment
   - Extensibility analysis
   - Relevance scoring
   - Implementation planning
3. Clone best match as foundation
4. Iterate within proven structure

# Performance Optimization

## Model Selection Strategy

**Gemini 3 Flash** (Fast, lightweight, high throughput):
- Lightweight agents with frequent invocation
- Pair programming and code generation
- Worker agents in multi-agent systems

**Gemini 3 Pro Low** (Balanced, main driver):
- Main development work
- Orchestrating multi-agent workflows
- Complex coding tasks

**Gemini 3 Pro High** (Deep reasoning, complex tasks):
- Complex architectural decisions
- Maximum reasoning requirements
- Research and analysis tasks

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Ultrathink + Plan Mode

For complex tasks requiring deep reasoning:
1. Use `ultrathink` for enhanced thinking
2. Enable **Plan Mode** for structured approach
3. "Rev the engine" with multiple critique rounds
4. Use split role sub-agents for diverse analysis

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix

# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues

# Testing Requirements

## Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (Playwright)

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first
- **e2e-runner** - Playwright E2E testing specialist
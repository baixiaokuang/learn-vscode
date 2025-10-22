# VS Code Codebase Deep Dive Learning Plan

**Prerequisites**: Strong TypeScript & Electron knowledge ✓
**Goal**: Master VS Code internals and architecture
**Total Time**: 10-12 weeks (30-40 hours/week)

---

## Overview: The Learning Philosophy

VS Code is a **layered architecture** with strict dependency rules. You can't understand it by reading top-to-bottom. Instead:

1. **Start with foundations** (base patterns used everywhere)
2. **Learn the DI system** (how everything connects)
3. **Trace vertical slices** (pick a feature, follow it through all layers)
4. **Study horizontal layers** (understand each architectural layer)
5. **Deep dive specific systems** (editor, extensions, etc.)

**Critical Rule**: Always run code with debugger attached. Never just read - execute, break, inspect.

---

## Phase 1: Foundations (Week 1, ~8-12 hours)

### Goal: Understand the core patterns that VS Code uses everywhere

### 1.1 The Disposable Pattern (2-3 hours)

**Why critical**: 90% of VS Code classes use this for lifecycle management.

**Study**:
- [src/vs/base/common/lifecycle.ts](src/vs/base/common/lifecycle.ts) (lines 1-400)
  - `IDisposable` interface
  - `Disposable` base class
  - `DisposableStore` - how to aggregate disposables
  - `MutableDisposable` and `RefCountedDisposable`

**Exercise**:
```typescript
// Create a class using Disposable pattern
class MyComponent extends Disposable {
  constructor() {
    super();
    this._register(someEventListener);  // Auto-cleanup
  }
}
```

**Time**: 2-3 hours reading + experimenting

### 1.2 Event System (2-3 hours)

**Why critical**: VS Code uses reactive patterns extensively.

**Study**:
- `src/vs/base/common/event.ts`
  - `Event<T>` type and `Emitter<T>` class
  - Event utilities: `Event.map`, `Event.filter`, `Event.debounce`
  - Understanding `onUnexpectedError` handling

**Pattern Recognition**:
```typescript
private _onDidChange = new Emitter<string>();
readonly onDidChange: Event<string> = this._onDidChange.event;

// Fire events
this._onDidChange.fire('new value');

// Subscribe
this._register(service.onDidChange(value => { ... }));
```

**Time**: 2-3 hours

### 1.3 Async Utilities (1-2 hours)

**Study**:
- `src/vs/base/common/async.ts`
  - `RunOnceScheduler` - delayed execution
  - `Throttler` and `Delayer`
  - `CancelablePromise` and `createCancelablePromise`
  - `Barrier` and `AsyncEmitter`

**Time**: 1-2 hours

### 1.4 Base Data Structures (2-3 hours)

**Quick survey of**:
- `src/vs/base/common/arrays.ts` - Array utilities
- `src/vs/base/common/map.ts` - `ResourceMap`, `SetMap`, etc.
- `src/vs/base/common/uri.ts` - URI handling (critical for VS Code)
- `src/vs/base/common/strings.ts` - String utilities

**Don't memorize - just know they exist for future reference.**

**Time**: 2-3 hours

---

## Phase 2: Dependency Injection System (Week 1-2, ~10-15 hours)

### Goal: Understand how VS Code wires everything together

### 2.1 Core DI Concepts (4-6 hours)

**This is THE most important system to understand.**

**Study in order**:

1. **Service Identifiers** (1.5 hours)
   - [src/vs/platform/instantiation/common/instantiation.ts](src/vs/platform/instantiation/common/instantiation.ts):37
   - How `createDecorator` works
   - Service branding pattern (`_serviceBrand: undefined`)

   ```typescript
   // Every service looks like this
   export const IMyService = createDecorator<IMyService>('myService');
   export interface IMyService {
     _serviceBrand: undefined;
     doSomething(): void;
   }
   ```

2. **Service Collection** (1.5 hours)
   - `src/vs/platform/instantiation/common/serviceCollection.ts`
   - How services are registered
   - Singleton vs instance registration

3. **Instantiation Service** (2-3 hours)
   - `src/vs/platform/instantiation/common/instantiationService.ts`
   - How constructor injection works
   - `createInstance` and `invokeFunction`
   - Service resolution and caching

**Time**: 4-6 hours

### 2.2 Service Registration Patterns (3-4 hours)

**Study**:
- `src/vs/platform/instantiation/common/extensions.ts`
  - `registerSingleton` - most common pattern
  - `getSingletonServiceDescriptors`

**Trace a real service** (pick one):
1. Find declaration: `export const IFileService = createDecorator<IFileService>(...)`
2. Find interface: `export interface IFileService { ... }`
3. Find implementation: `class FileService implements IFileService { ... }`
4. Find registration: `registerSingleton(IFileService, FileService)`
5. Find usage: `constructor(@IFileService private fileService: IFileService)`

**Exercise**: Trace these 3 services end-to-end:
- `IConfigurationService` - Simple, good starting point
- `IFileService` - Medium complexity
- `IEditorService` - More complex

**Time**: 3-4 hours

### 2.3 Injection Decorators (2-3 hours)

**Understand**:
- How `@IServiceName` decorator works internally
- How VS Code extracts service dependencies from constructors
- Optional vs required services

**Read the implementation**:
- `src/vs/platform/instantiation/common/instantiation.ts` (decorators section)
- See how `_util.DI_DEPENDENCIES` stores metadata

**Time**: 2-3 hours

### 2.4 Service Scopes & Lifecycles (1-2 hours)

**Understand**:
- When services are created (lazy vs eager)
- Service disposal
- Child instantiation services
- Platform vs workbench services

**Time**: 1-2 hours

---

## Phase 3: Process Architecture (Week 2, ~8-10 hours)

### Goal: Understand VS Code's multi-process model

### 3.1 Process Model Overview (1-2 hours)

**VS Code runs in 4+ processes**:

1. **Main Process** (Electron main) - Window management, native APIs
2. **Renderer Process** (Electron renderer) - The workbench UI
3. **Extension Host Process** - Runs extensions in isolation
4. **Shared Process** - Background tasks (indexing, search, etc.)
5. **Language Server Processes** - Per language

**Read**:
- `src/vs/base/parts/ipc/` - IPC infrastructure
- Understand why this separation exists (security, stability, performance)

**Time**: 1-2 hours

### 3.2 Main Process (3-4 hours)

**Entry point**: [src/vs/code/electron-main/main.ts](src/vs/code/electron-main/main.ts)

**Study flow**:
1. `main.ts` - Bootstrap and error handling
2. `app.ts` - `CodeApplication` class
   - Creates `IInstantiationService`
   - Registers platform services
   - Opens first window
3. Window management - `src/vs/code/electron-main/window.ts`
4. Lifecycle - `src/vs/code/electron-main/lifecycle.ts`

**Debug exercise**:
- Set breakpoint in `main.ts`
- Launch VS Code from source: `./scripts/code.sh` (or `.bat` on Windows)
- Step through entire startup sequence
- Observe window creation

**Time**: 3-4 hours

### 3.3 Renderer Process (Workbench) (3-4 hours)

**Entry points** (different for desktop vs web):
- **Desktop**: `src/vs/workbench/electron-sandbox/desktop.main.ts`
- **Web**: [src/vs/workbench/browser/web.main.ts](src/vs/workbench/browser/web.main.ts)

**Bootstrap sequence**:
1. Create services
2. Initialize workbench: [src/vs/workbench/browser/workbench.ts](src/vs/workbench/browser/workbench.ts)
3. Create layout
4. Load contributions
5. Restore state

**Critical class**: `Workbench` class in [workbench.ts:65](src/vs/workbench/browser/workbench.ts#L65)

**Debug exercise**:
- Attach to renderer process
- Breakpoint in `Workbench` constructor
- Trace initialization

**Time**: 3-4 hours

### 3.4 Extension Host Process (2-3 hours)

**Entry point**: `src/vs/workbench/api/node/extHost.ts`

**Understand**:
- Why extensions run in separate process
- How main ↔ extension host communicate (RPC)
- Extension activation sequence

**Just overview for now - deep dive in Phase 5**

**Time**: 2-3 hours (overview only)

---

## Phase 4: Layered Architecture (Week 3-4, ~20-25 hours)

### Goal: Understand each architectural layer

### 4.1 Layer Rules (1 hour)

**The fundamental constraint**:

```
base/          (no dependencies on other layers)
  ↑
platform/      (depends on base only)
  ↑
editor/        (depends on base + platform)
  ↑
workbench/     (depends on everything)
```

**Validate**:
```bash
npm run valid-layers-check
```

Read the output - it shows violations and explains rules.

**Time**: 1 hour

### 4.2 Base Layer (`src/vs/base/`) (3-4 hours)

**Three subdivisions**:
- `common/` - Platform-agnostic (runs anywhere)
- `browser/` - Browser-specific APIs (DOM, etc.)
- `node/` - Node.js-specific APIs (filesystem, child_process, etc.)

**Key subsystems to survey**:
- `browser/dom.ts` - DOM utilities
- `browser/ui/` - UI widgets (list, tree, menu, etc.)
- `common/network.ts` - Network abstractions
- `parts/ipc/` - Inter-process communication
- `parts/storage/` - Storage primitives

**Don't read everything - skim to know what exists.**

**Time**: 3-4 hours

### 4.3 Platform Layer (`src/vs/platform/`) (8-10 hours)

**This is where most services live.** Platform services are low-level, reusable across workbench.

**Study these services in depth**:

1. **Configuration Service** (2 hours)
   - `src/vs/platform/configuration/`
   - How `settings.json` is loaded and watched
   - Configuration scopes (user, workspace, folder)
   - Schema registration

2. **File Service** (2-3 hours)
   - `src/vs/platform/files/`
   - File system providers (disk, memory, browser, etc.)
   - File watching
   - Read/write/delete operations
   - `src/vs/platform/files/common/files.ts` - Core interfaces

3. **Storage Service** (1.5 hours)
   - `src/vs/platform/storage/`
   - Key-value storage
   - Scopes: `StorageScope.WORKSPACE` vs `StorageScope.PROFILE`

4. **Log Service** (1 hour)
   - `src/vs/platform/log/`
   - Simple but used everywhere

5. **Environment Service** (1 hour)
   - `src/vs/platform/environment/`
   - Paths, CLI arguments, etc.

6. **Keybinding Service** (1.5-2 hours)
   - `src/vs/platform/keybinding/`
   - How keybindings resolve
   - When-clause evaluation (contexts)

**Exercise**: For each service, trace:
1. Interface definition
2. Implementation
3. Registration
4. Usage in 2-3 places

**Time**: 8-10 hours

### 4.4 Editor Layer (`src/vs/editor/`) (6-8 hours)

**Monaco Editor** - The standalone text editor at VS Code's core.

**Critical concept**: Monaco can run independently of VS Code workbench.

**Study structure**:

1. **Common** (`src/vs/editor/common/`) (3-4 hours)
   - `model/textModel.ts` - How text is represented in memory
   - `core/position.ts` and `core/range.ts` - Fundamental types
   - `languages/` - Language features (completion, hover, etc.)
   - `services/` - Editor services

2. **Browser** (`src/vs/editor/browser/`) (2-3 hours)
   - `view/` - Rendering layer
   - `controller/` - Input handling
   - `widget/` - Editor widgets (suggest widget, hover widget)

3. **Standalone** (`src/vs/editor/standalone/`) (1 hour)
   - Standalone editor API
   - `src/vs/editor/editor.api.ts` - Public API surface

**Exercise**:
- Create a minimal Monaco editor outside VS Code
- Read the Monaco playground code
- Trace how typing a character flows: keyboard → controller → model → view

**Time**: 6-8 hours

### 4.5 Workbench Layer (`src/vs/workbench/`) (6-8 hours)

**The application layer.** Most complex.

**Structure**:
- `browser/` - Core workbench UI
- `services/` - Workbench-level services
- `contrib/` - Feature contributions
- `api/` - Extension API implementation
- `common/` - Shared workbench code

**Focus areas**:

1. **Layout System** (2-3 hours)
   - [src/vs/workbench/browser/layout.ts](src/vs/workbench/browser/layout.ts) - Main layout class
   - `src/vs/workbench/browser/parts/` - Parts (sidebar, panel, editor area, etc.)
   - Grid layout system
   - Resizing, maximizing, panel positions

2. **Views & View Containers** (2-3 hours)
   - `src/vs/workbench/common/views.ts` - View abstraction
   - `src/vs/workbench/browser/parts/views/` - View rendering
   - Example: File Explorer is a view in the Explorer view container

3. **Editors** (2 hours)
   - `src/vs/workbench/services/editor/` - Editor management service
   - `src/vs/workbench/browser/parts/editor/` - Editor groups, tabs
   - How text editors vs custom editors work
   - Split editor groups

**Exercise**:
- Trace opening a file: File Explorer click → editor service → editor group → text editor
- Understand the difference between Monaco editor (Phase 4.4) and workbench editors

**Time**: 6-8 hours

---

## Phase 5: Command & Contribution System (Week 4-5, ~8-10 hours)

### Goal: Understand how features register themselves

### 5.1 Command System (3-4 hours)

**Everything is a command.**

**Study**:
1. **Command Registry** (1.5 hours)
   - `src/vs/platform/commands/common/commands.ts`
   - How commands register: `CommandsRegistry.registerCommand`
   - Command handlers and execution

2. **Actions** (1.5 hours)
   - `src/vs/platform/actions/common/actions.ts`
   - Difference between `Command` and `Action`
   - `MenuRegistry` - how commands appear in menus

3. **Command Palette** (1 hour)
   - `src/vs/workbench/contrib/quickaccess/` - Quick access system
   - How commands appear in Command Palette

**Exercise**:
- Register a custom command
- Add it to Command Palette
- Add it to a context menu
- Add a keybinding

**Time**: 3-4 hours

### 5.2 Keybinding System (2-3 hours)

**Study**:
- `src/vs/platform/keybinding/common/keybindingsRegistry.ts`
- When-clause evaluation (`src/vs/platform/contextkey/`)
- How `keybindings.json` is processed
- Default keybindings

**Understand contexts**:
```typescript
when: 'editorTextFocus && !editorReadonly'
```

**Exercise**:
- Create a custom when-clause context
- Register a keybinding that uses it

**Time**: 2-3 hours

### 5.3 Menu System (2-3 hours)

**Study**:
- `src/vs/platform/actions/common/actions.ts` - Menu IDs
- How menu items are registered
- Menu contexts and enablement

**VS Code has many menus**:
- Editor context menu
- Explorer context menu
- Title bar menus
- View title menus
- etc.

**Exercise**:
- Add a menu item to the editor context menu
- Make it conditional based on file type

**Time**: 2-3 hours

### 5.4 Configuration Contributions (1-2 hours)

**Study**:
- `src/vs/platform/configuration/common/configurationRegistry.ts`
- How to register settings
- Setting types, defaults, scope

**Exercise**:
- Register a custom setting
- Read it from code
- Make UI react to changes

**Time**: 1-2 hours

---

## Phase 6: Extension API & Extension Host (Week 5-6, ~12-15 hours)

### Goal: Understand how extensions work

### 6.1 Extension API Surface (2-3 hours)

**Study**:
- `src/vscode.d.ts` - THE public API
- Read the entire file (it's well documented)
- Understand namespaces: `vscode.window`, `vscode.workspace`, `vscode.languages`, etc.

**This defines what extensions can do.**

**Time**: 2-3 hours

### 6.2 RPC Protocol (3-4 hours)

**Critical**: Extension host and main thread are separate processes.

**Study**:
- `src/vs/workbench/api/common/extHost.protocol.ts` - Protocol definition
- Proxy pattern: Main thread ↔ Extension host
- `MainThreadXxx` classes (run in renderer)
- `ExtHostXxx` classes (run in extension host)

**Example flow**:
```
Extension calls vscode.window.showInformationMessage()
  → ExtHostMessageService (in extension host)
  → IPC message
  → MainThreadMessageService (in renderer)
  → NotificationService (actual UI)
```

**Exercise**:
- Pick 3 API methods from `vscode.d.ts`
- Trace each through the RPC layer
- Find the `ExtHost*` and `MainThread*` implementations

**Time**: 3-4 hours

### 6.3 Extension Host Implementation (4-5 hours)

**Study these extension host services**:

1. **ExtHostCommands** (1 hour)
   - `src/vs/workbench/api/common/extHostCommands.ts`
   - How `vscode.commands.registerCommand` works

2. **ExtHostTextEditors** (1.5 hours)
   - `src/vs/workbench/api/common/extHostTextEditors.ts`
   - How `vscode.window.activeTextEditor` works
   - Text document synchronization

3. **ExtHostLanguageFeatures** (2 hours)
   - `src/vs/workbench/api/common/extHostLanguageFeatures.ts`
   - How `vscode.languages.registerCompletionItemProvider` works
   - Provider adapters

4. **ExtHostFileSystem** (0.5-1 hour)
   - `src/vs/workbench/api/common/extHostFileSystem.ts`
   - Custom file system providers

**Time**: 4-5 hours

### 6.4 Extension Activation (2-3 hours)

**Study**:
- `src/vs/workbench/services/extensions/` - Extension management
- Extension scanner and loader
- Activation events (`onLanguage:typescript`, `onCommand:...`, etc.)
- Lazy activation strategy

**Exercise**:
- Create a simple extension
- Debug both sides:
  - Breakpoint in extension code (extension host process)
  - Breakpoint in `MainThreadCommands` (renderer process)
- Trace activation

**Time**: 2-3 hours

---

## Phase 7: Built-in Features Deep Dive (Week 7-8, ~20-25 hours)

### Goal: Study how major features are implemented

### 7.1 Language Features & LSP (5-6 hours)

**Study**:

1. **Language Feature Providers** (2 hours)
   - `src/vs/editor/common/languages/` - Provider interfaces
   - How completion, hover, definition, etc. work
   - `src/vs/editor/contrib/` - Editor contributions for language features

2. **TypeScript Extension** (3-4 hours)
   - `extensions/typescript-language-features/` - Real language extension
   - LSP client implementation
   - Communication with `tsserver`
   - How diagnostics, completions, etc. flow

**Exercise**:
- Trace "Go to Definition" from clicking in editor → extension API → TypeScript language server → back to UI
- Read a simpler extension: `extensions/json-language-features/`

**Time**: 5-6 hours

### 7.2 File Explorer (3-4 hours)

**Study**:
- `src/vs/workbench/contrib/files/` - Files contribution
- `src/vs/workbench/contrib/files/browser/views/explorerViewer.ts` - Tree view
- How file watching triggers UI updates
- Drag and drop
- Context menu

**Understand**:
- Tree widget reuse (`src/vs/base/browser/ui/tree/`)
- Virtualization (can show 100k files)
- Incremental updates

**Time**: 3-4 hours

### 7.3 Search (4-5 hours)

**Complex feature - search is hard.**

**Study**:
- `src/vs/workbench/contrib/search/` - Search UI
- `src/vs/workbench/services/search/` - Search service
- `src/vs/workbench/services/search/node/ripgrepSearchProvider.ts` - ripgrep integration
- Text search vs file search

**Understand**:
- How search runs in background (worker processes)
- Result streaming
- Search editor

**Time**: 4-5 hours

### 7.4 Debug (5-6 hours)

**Debug Adapter Protocol implementation.**

**Study**:
- `src/vs/workbench/contrib/debug/` - Debug UI
  - Debug viewlet
  - Breakpoint management
  - Debug toolbar
- `src/vs/workbench/contrib/debug/node/debugAdapter.ts` - DAP adapter
- `extensions/debug-auto-launch/` - Simple debug extension

**Exercise**:
- Run a Node.js debug session
- Set breakpoint in VS Code's debug UI code
- Trace DAP messages (use `Debug: Toggle Debug Console` setting)

**Time**: 5-6 hours

### 7.5 Terminal (3-4 hours)

**Study**:
- `src/vs/workbench/contrib/terminal/` - Terminal contribution
- `src/vs/platform/terminal/node/ptyService.ts` - PTY management
- `node_modules/node-pty/` - Native module (briefly)
- Terminal link detection, shell integration

**Understand**:
- How xterm.js is integrated
- Process management
- Terminal persistence

**Time**: 3-4 hours

### 7.6 Source Control (Git) (2-3 hours)

**Study**:
- `src/vs/workbench/contrib/scm/` - SCM framework (UI)
- `extensions/git/` - Git provider implementation
- How Git operations trigger UI updates
- Decorations (file colors, badges)

**Time**: 2-3 hours

---

## Phase 8: Performance & Advanced Topics (Week 9-10, ~12-15 hours)

### 8.1 Performance Patterns (5-6 hours)

**VS Code is fast. Learn why.**

1. **Virtualization** (2 hours)
   - `src/vs/base/browser/ui/list/listView.ts` - Virtual scrolling
   - `src/vs/base/browser/ui/tree/` - Virtual trees
   - How Explorer renders 100k files instantly

2. **Lazy Loading** (1.5 hours)
   - Lazy service instantiation
   - Code splitting
   - Extension activation events

3. **Web Workers** (1.5-2 hours)
   - `src/vs/editor/common/services/editorWorkerService.ts`
   - What runs in workers (diff computation, etc.)
   - Search workers

4. **Profiling** (1 hour)
   - Use Chrome DevTools to profile VS Code
   - Common bottlenecks
   - Performance marks in code

**Time**: 5-6 hours

### 8.2 Web vs Desktop (3-4 hours)

**VS Code runs in browser (vscode.dev) AND desktop.**

**Study abstractions**:
- `src/vs/workbench/browser/` - Works in both
- `src/vs/workbench/electron-sandbox/` - Desktop-specific
- Platform services: `browser/` vs `node/` implementations

**Key differences**:
- File system (browser uses virtual FS)
- Extensions (web extensions vs Node.js extensions)
- Capabilities

**Exercise**:
- Run web version: `./scripts/code-web.sh`
- Compare file service implementations
- Understand fallback strategies

**Time**: 3-4 hours

### 8.3 Remote Development (3-4 hours)

**VS Code Server architecture.**

**Study**:
- `src/vs/server/` - Remote server
- `src/vs/workbench/services/remote/` - Remote connections
- How extensions run remotely
- File system tunneling

**Understand**:
- Client-server split
- Extension host location
- Network protocol

**Time**: 3-4 hours

### 8.4 Testing Infrastructure (1-2 hours)

**How VS Code tests itself.**

**Study**:
- Unit tests: `src/vs/*/test/`
- `test/integration/` - Integration tests
- `test/smoke/` - Smoke tests
- Test runners and frameworks

**Run tests**:
```bash
./scripts/test.sh --grep "FileService"
```

**Time**: 1-2 hours

---

## Phase 9: Advanced Features (Week 11, ~10-12 hours)

### Pick 2-3 advanced features to study deeply:

### Option A: Notebooks (4-5 hours)
- `src/vs/workbench/contrib/notebook/`
- Cell-based editing
- Output rendering
- Kernel management

### Option B: Chat/AI Features (4-5 hours)
- `src/vs/workbench/contrib/chat/`
- Language model integration
- Chat UI
- Inline chat

### Option C: Testing UI (3-4 hours)
- `src/vs/workbench/contrib/testing/`
- Test discovery and running
- Test explorer UI

### Option D: Accessibility (3-4 hours)
- `src/vs/platform/accessibility/`
- Screen reader support
- Accessibility signals
- ARIA implementation

### Option E: Themes & Tokenization (3-4 hours)
- `src/vs/workbench/services/themes/`
- TextMate grammar integration
- Theme loading and application
- Semantic tokenization

**Time**: Pick 2-3 areas, 10-12 hours total

---

## Phase 10: Contribute (Week 12, ~8-12 hours)

### Goal: Make a real contribution

### 10.1 Pick a Good First Issue (2-3 hours)

**Search GitHub**:
- Label: `good first issue`
- Or pick a small feature you want

**Understand the codebase area**:
- Read related code
- Find similar features
- Understand test requirements

**Time**: 2-3 hours

### 10.2 Implement the Change (4-6 hours)

**Follow the patterns**:
- Use DI correctly
- Respect layer architecture
- Add tests
- Localize strings with `nls.localize()`
- Add copyright header

**Build and test**:
```bash
# Start watch mode
Run "VS Code - Build" task

# Check for errors in task output

# Run tests
./scripts/test.sh --grep "your test pattern"

# Run hygiene checks
npm run eslint
npm run hygiene
```

**Time**: 4-6 hours

### 10.3 Submit PR (2-3 hours)

**Before submitting**:
- Read `CONTRIBUTING.md`
- Ensure all tests pass
- Write good commit messages
- Reference issue number

**Review process**:
- Be patient
- Address feedback
- Learn from reviewers

**Time**: 2-3 hours

---

## Daily Practice Routine

### Every Day (45-60 min)

1. **Code Reading** (20-30 min)
   - Pick one file/class
   - Read thoroughly with debugger
   - Understand all dependencies

2. **Hands-On Exercise** (15-20 min)
   - Modify something small
   - Add a command
   - Change behavior
   - Experiment

3. **Trace a User Action** (10-15 min)
   - Pick any UI action
   - Set breakpoints
   - Follow execution from UI → backend → back

### Weekly Goals

- **Week 1-2**: Master DI and base patterns
- **Week 3-4**: Understand all layers
- **Week 5-6**: Trace extension API calls
- **Week 7-8**: Study 3-4 major features
- **Week 9-10**: Performance and platform differences
- **Week 11**: Deep dive your interest area
- **Week 12**: Ship a contribution

---

## Essential Tools & Techniques

### Debug Configuration

Create `.vscode/launch.json` in VS Code repo:

```json
{
  "configurations": [
    {
      "name": "Launch VS Code",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/scripts/code.sh"
    },
    {
      "name": "Attach to Extension Host",
      "type": "node",
      "request": "attach",
      "port": 5870
    }
  ]
}
```

### Debugging Tips

1. **Launch from source**: `./scripts/code.sh --inspect-brk-extensions=9993`
2. **Attach to all processes**: Main, Renderer, Extension Host
3. **Use logpoints**: Right-click breakpoint → Add logpoint
4. **Call stack is your friend**: Always read it bottom-to-top

### Code Navigation

- **"Go to Symbol"**: `Ctrl+Shift+O` - Find methods in current file
- **"Find All References"**: See how something is used
- **"Go to Definition"**: `F12` - Jump to implementation
- **"Peek Definition"**: `Alt+F12` - Inline view
- **Git Blame**: Understand *why* code exists

### Build & Test Workflow

```bash
# Always keep this running
Run "VS Code - Build" task

# CRITICAL: Check task output for TypeScript errors
# NEVER run tests if compilation fails

# Run specific test
./scripts/test.sh --grep "test name"

# Run integration tests
./scripts/test-integration.sh

# Check layer violations
npm run valid-layers-check

# Hygiene
npm run eslint
npm run hygiene
```

---

## Key Success Metrics

### By Week 2
✅ Explain the Disposable pattern
✅ Explain how DI works in VS Code
✅ Trace service registration → instantiation → usage
✅ Understand the 4-layer architecture

### By Week 4
✅ Explain the difference between platform and workbench services
✅ Trace a UI action through all layers
✅ Understand Monaco editor architecture
✅ Register a command with menu item and keybinding

### By Week 6
✅ Explain extension host architecture
✅ Trace an extension API call through RPC layer
✅ Understand how language features work
✅ Debug both main and extension host simultaneously

### By Week 8
✅ Explain how any built-in feature works (search, debug, git, etc.)
✅ Understand performance patterns (virtualization, lazy loading, workers)
✅ Know the difference between web and desktop implementations

### By Week 10
✅ Understand remote development architecture
✅ Read and understand complex PRs
✅ Identify appropriate locations for new code

### By Week 12
✅ **Ship a PR to VS Code** 🚀
✅ Confidently navigate the entire codebase
✅ Understand VS Code well enough to architect new features

---

## Common Pitfalls to Avoid

### ❌ Don't Do This

1. **Reading linearly** - Don't read files alphabetically
2. **Ignoring layers** - Don't import `workbench/` from `platform/`
3. **Skipping tests** - Tests show real usage patterns
4. **Not running code** - Reading without debugging is ineffective
5. **Trying to memorize** - Focus on understanding patterns, not details
6. **Getting lost in details** - Know when to skim vs deep dive

### ✅ Do This Instead

1. **Trace vertically** - Pick a feature, follow through all layers
2. **Run `valid-layers-check`** - Let the tool teach you
3. **Read tests first** - They show expected behavior
4. **Debug everything** - Breakpoints > reading
5. **Focus on patterns** - DI, contributions, commands, events
6. **Keep notes** - Document your learning journey

---

## Reference: Essential Files to Bookmark

### Architecture
- [src/vs/base/common/lifecycle.ts](src/vs/base/common/lifecycle.ts) - Disposable pattern
- `src/vs/base/common/event.ts` - Event system
- [src/vs/platform/instantiation/common/instantiation.ts](src/vs/platform/instantiation/common/instantiation.ts) - DI core
- [src/vs/workbench/browser/workbench.ts](src/vs/workbench/browser/workbench.ts) - Workbench entry

### Extension API
- `src/vscode.d.ts` - Public API
- `src/vs/workbench/api/common/extHost.protocol.ts` - RPC protocol
- `src/vs/workbench/api/common/extHostLanguageFeatures.ts` - Language features

### Entry Points
- [src/vs/code/electron-main/main.ts](src/vs/code/electron-main/main.ts) - Electron main
- `src/vs/workbench/electron-sandbox/desktop.main.ts` - Desktop renderer
- [src/vs/workbench/browser/web.main.ts](src/vs/workbench/browser/web.main.ts) - Web workbench

### Key Services
- `src/vs/platform/files/common/files.ts` - File service
- `src/vs/platform/configuration/common/configuration.ts` - Configuration
- `src/vs/workbench/services/editor/common/editorService.ts` - Editor service

### Build & Test
- `build/gulpfile.js` - Build system
- `scripts/test.sh` - Test runner
- `.vscode/tasks.json` - VS Code tasks

---

## Learning Resources

### Official Documentation
- **CONTRIBUTING.md** - In this repo, read it first
- **CLAUDE.md** - Architecture guide (you're reading the supplementary plan)
- **VS Code Wiki**: https://github.com/microsoft/vscode/wiki
- **Extension API Docs**: https://code.visualstudio.com/api

### Architecture Guides
- **Source Code Organization**: https://github.com/microsoft/vscode/wiki/Source-Code-Organization
- **How to Contribute**: https://github.com/microsoft/vscode/wiki/How-to-Contribute

### Community
- **GitHub Issues**: Read discussions on complex features
- **GitHub PRs**: Read merged PRs to learn patterns
- **VS Code Discord/Slack**: Ask questions

---

## Customizing This Plan

### If You Have Less Time (6-8 weeks)

**Focus on**:
- Phases 1-6 (fundamentals + extension API)
- Pick only 1-2 features in Phase 7
- Skip Phase 9, go straight to contribution

### If You Have More Time (16-20 weeks)

**Add**:
- Deep dive ALL features in Phase 7
- Study ALL advanced topics in Phase 9
- Contribute multiple PRs
- Read the entire codebase (all contrib folders)

### If You Want to Specialize

**Language Features**: Phases 1-6 + 7.1 deeply
**UI/UX**: Phases 1-5 + workbench layout + themes
**Extensions**: Phases 1-6 + all extension-related code
**Performance**: All phases + deep profiling work

---

## Final Thoughts

**The secret to learning VS Code**:

1. **Don't try to learn everything** - It's 3+ million lines of code
2. **Learn patterns, not details** - Same patterns repeat everywhere
3. **Debug, don't just read** - See code execute
4. **Contribute early** - Best way to learn
5. **Be patient** - This is a complex, mature codebase

**You know TypeScript and Electron well**, so you have a **huge advantage**. Focus on:
- The unique architectural patterns (DI, layering, contributions)
- The domain knowledge (how editors, extensions, language features work)

**Most important**: Start the `VS Code - Build` task, attach the debugger, and start exploring. Reading this plan is helpful, but **running the code** is how you'll truly understand.

Good luck! 🚀

---

**Next Steps**:
1. Start with Phase 1 tomorrow
2. Set up your debug configuration
3. Run the build task
4. Read [src/vs/base/common/lifecycle.ts](src/vs/base/common/lifecycle.ts)
5. Write your first Disposable class

You've got this! 💪

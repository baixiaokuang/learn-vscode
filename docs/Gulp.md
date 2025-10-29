# Gulp Build System in VS Code

This document provides a comprehensive overview of how the Gulp build system works in the VS Code repository.

## Table of Contents

- [Overview](#overview)
- [File Organization](#file-organization)
- [Task Categories](#task-categories)
- [Main VS Code Build Tasks](#main-vs-code-build-tasks)
- [How Build Tasks Work Under the Hood](#how-build-tasks-work-under-the-hood)
- [Build Infrastructure](#build-infrastructure)
- [Common Workflows](#common-workflows)

## Overview

VS Code uses [Gulp](https://gulpjs.com/) as its task runner to orchestrate the build process. The build system is responsible for:

- **TypeScript compilation** of the core codebase and extensions
- **Bundling and optimization** using esbuild
- **Localization (NLS)** processing
- **Code quality checks** (hygiene, ESLint)
- **Packaging** for different platforms (Windows, macOS, Linux)
- **Continuous Integration** builds

The build system is highly modularized, with different gulpfiles handling different aspects of the build process.

## File Organization

### Entry Point

```txt
gulpfile.js (root)
  └─> build/gulpfile.js (main orchestrator)
```

The root [gulpfile.js](../gulpfile.js) is a simple entry point that loads [build/gulpfile.js](../build/gulpfile.js).

### Modular Gulpfiles

The build logic is split across multiple gulpfiles in the [build/](../build/) directory:

| File                                                          | Purpose                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [gulpfile.js](../build/gulpfile.js)                           | **Main orchestrator** - defines core tasks and loads all other gulpfiles              |
| [gulpfile.compile.js](../build/gulpfile.compile.js)           | **Compilation tasks** for production builds (with/without mangling)                   |
| [gulpfile.extensions.js](../build/gulpfile.extensions.js)     | **Extension compilation** - TypeScript compilation for all built-in extensions        |
| [gulpfile.vscode.js](../build/gulpfile.vscode.js)             | **Desktop packaging** - bundles, minifies, and packages VS Code for desktop platforms |
| [gulpfile.vscode.web.js](../build/gulpfile.vscode.web.js)     | **Web builds** - packaging for the web version of VS Code                             |
| [gulpfile.reh.js](../build/gulpfile.reh.js)                   | **Remote Extension Host** - builds for VS Code Server/remote development              |
| [gulpfile.editor.js](../build/gulpfile.editor.js)             | **Monaco Editor** - standalone Monaco editor builds                                   |
| [gulpfile.hygiene.js](../build/gulpfile.hygiene.js)           | **Code quality** - hygiene checks, package.json validation                            |
| [gulpfile.cli.js](../build/gulpfile.cli.js)                   | **CLI builds** - command-line interface builds                                        |
| [gulpfile.scan.js](../build/gulpfile.scan.js)                 | **Security scanning** - dependency and license scanning                               |
| [gulpfile.vscode.win32.js](../build/gulpfile.vscode.win32.js) | **Windows-specific** builds and packaging                                             |
| [gulpfile.vscode.linux.js](../build/gulpfile.vscode.linux.js) | **Linux-specific** builds and packaging                                               |

### Build Libraries and Utilities

Supporting libraries and utilities are in [build/lib/](../build/lib/):

```txt
build/lib/
├── compilation.js          # TypeScript compilation orchestration
├── task.js                 # Task infrastructure (series, parallel, define)
├── tsb/                    # Custom TypeScript builder
│   ├── index.js           # TSB entry point
│   ├── builder.js         # Incremental builder
│   └── transpiler.js      # Fast transpilation
├── optimize.js            # Bundling and minification with esbuild
├── bundle.js              # Bundle configuration
├── extensions.js          # Extension packaging utilities
├── util.js                # Common utilities
├── watch/                 # File watching utilities
├── nls.js                 # Localization processing
├── mangle/                # Code mangling for production
├── i18n.js                # Internationalization
└── ...
```

## Task Categories

### 1. Compilation Tasks

These tasks compile TypeScript source code to JavaScript.

#### Core Compilation

- **`compile-api-proposal-names`** - Generates API proposal names from vscode.proposed.\*.d.ts files
- **`transpile-client`** - Fast transpilation of `src/` (no type checking)
- **`transpile-client-esbuild`** - Transpilation using esbuild (fastest)
- **`compile-client`** - Full TypeScript compilation of `src/` with type checking
- **`compile`** - **Main compilation task** (compiles client + extensions + monaco typecheck + extension media)

#### Production Compilation

- **`compile-build-without-mangling`** - Production build for PRs (minified, no mangling)
- **`compile-build-with-mangling`** - Production build for CI (minified, mangled)

These tasks:

- Clean output directory (`out-build`)
- Write ISO date stamp
- Compile with full type checking
- Generate NLS metadata
- Optionally mangle private fields and exports

### 2. Watch Tasks

Watch tasks enable incremental compilation during development.

- **`watch-client`** - Watch `src/` and recompile on changes
- **`watch-extensions`** - Watch extensions and recompile on changes
- **`watch-extension-media`** - Watch extension media files
- **`watch-web`** - Watch web extensions
- **`watch-api-proposal-names`** - Watch API proposal files
- **`watch`** - **Main watch task** (watches client + extensions)

Individual extension watch tasks:

- `watch-extension:<name>` - Watch a specific extension (e.g., `watch-extension:git`)

### 3. Extension Tasks

Each built-in extension has three task variants:

- **`transpile-extension:<name>`** - Fast transpilation (no type checking)
- **`compile-extension:<name>`** - Full compilation with type checking
- **`watch-extension:<name>`** - Watch mode for the extension

Aggregate tasks:

- **`transpile-extensions`** - Transpile all extensions in parallel
- **`compile-extensions`** - Compile all extensions in parallel
- **`watch-extensions`** - Watch all extensions in parallel
- **`compile-extension-media`** - Compile extension media (icons, images, etc.)

Build-specific extension tasks:

- **`clean-extensions-build`** - Clean `.build/extensions` directory
- **`compile-non-native-extensions-build`** - Package non-native extensions for distribution
- **`compile-native-extensions-build`** - Package native extensions (with .node modules)
- **`compile-extensions-build`** - Package all extensions for distribution
- **`extensions-ci`** - CI task for extensions (non-native + media)
- **`extensions-ci-pr`** - PR task for extensions (all extensions + media)

### 4. Bundling and Minification Tasks

These tasks bundle and optimize code for production.

- **`bundle-vscode`** - Bundle VS Code using esbuild

  - Uses entry points from [buildfile.js](../build/buildfile.js)
  - Bundles ESM modules
  - Removes TypeScript boilerplate
  - Outputs to `out-vscode/`

- **`minify-vscode`** - Minify bundled VS Code
  - Minifies JavaScript
  - Rewrites source map URLs
  - Outputs to `out-vscode-min/`

Similar tasks exist for other targets:

- `bundle-vscode-reh` / `minify-vscode-reh` - Remote Extension Host
- `bundle-vscode-reh-web` / `minify-vscode-reh-web` - Web version of Remote Extension Host
- `bundle-vscode-web` / `minify-vscode-web` - VS Code for Web

### 5. Packaging Tasks

Platform-specific packaging tasks create distributable VS Code builds.

#### Desktop Builds

For each platform/architecture combination:

- **`vscode-<platform>-<arch>`** - Full build (compile + package)
- **`vscode-<platform>-<arch>-min`** - Minified build
- **`vscode-<platform>-<arch>-ci`** - CI-only packaging (assumes compilation is done)

Examples:

- `vscode-win32-x64` / `vscode-win32-x64-min`
- `vscode-darwin-x64` / `vscode-darwin-arm64`
- `vscode-linux-x64` / `vscode-linux-arm64`

Shortcuts (for current platform):

- **`vscode`** - Build for current platform
- **`vscode-min`** - Minified build for current platform

#### Remote/Server Builds

- `vscode-reh-<platform>-<arch>` - Remote Extension Host builds
- `vscode-reh-web-<platform>-<arch>` - Web-based Remote Extension Host

#### Web Builds

- `vscode-web` - VS Code for Web

### 6. CI/CD Tasks

- **`core-ci`** - Main CI build (compile with mangling + minify all variants)
- **`core-ci-pr`** - PR CI build (compile without mangling + minify all variants)

### 7. Quality and Hygiene Tasks

- **`hygiene`** - Run all hygiene checks
  - Copyright headers
  - Code formatting
  - Indentation (tabs vs spaces)
  - EOL characters
  - File naming conventions
- **`check-package-json`** - Validate package.json files across the repo
- **`eslint`** - Run ESLint (not a gulp task, but related)

### 8. Monaco Editor Tasks

- **`extract-editor-src`** - Extract Monaco Editor sources from VS Code
- **`compile-editor-esm`** - Compile Monaco Editor as ESM modules
- **`monacodts`** - Generate monaco.d.ts
- **`editor-distro`** - Create Monaco Editor distribution

### 9. Localization Tasks

- **`vscode-translations-export`** - Export strings for translation
- **`vscode-translations-import`** - Import translated strings

### 10. Web Extension Tasks

- **`compile-web`** - Compile web extensions
- **`watch-web`** - Watch web extensions

## Main VS Code Build Tasks

### Development Workflow

#### 1. `compile`

The default and most commonly used compilation task.

```bash
gulp compile
# or simply
gulp
```

**What it does:**

- Runs in parallel:
  - `monacoTypecheckTask` - Type checks Monaco editor
  - `compile-client` - Compiles `src/` directory
  - `compile-extensions` - Compiles all extensions
  - `compile-extension-media` - Compiles extension media

**Output:** `out/` directory

**Use when:** You want a full one-time compilation

#### 2. `watch`

Incremental compilation with file watching.

```bash
gulp watch
```

**What it does:**

- Runs in parallel:
  - `watch-client` - Watches and recompiles `src/`
  - `watch-extensions` - Watches and recompiles extensions

**Use when:** You're actively developing and want automatic recompilation

**Note:** This is used internally by the "VS Code - Build" task in [.vscode/tasks.json](../.vscode/tasks.json)

### Production Build Workflow

#### 3. `core-ci`

Full production build for continuous integration.

```bash
gulp core-ci
```

**What it does:**

1. `compile-build-with-mangling` - Compiles with mangling for code size optimization
2. Runs in parallel:
   - `minify-vscode` - Desktop build
   - `minify-vscode-reh` - Remote Extension Host
   - `minify-vscode-reh-web` - Web Remote Extension Host

**Output:** `out-vscode-min/`, `out-vscode-reh-min/`, etc.

**Use when:** Building for production/release

#### 4. `core-ci-pr`

PR build without mangling (for faster builds and easier debugging).

```bash
gulp core-ci-pr
```

**What it does:** Same as `core-ci` but uses `compile-build-without-mangling`

#### 5. `vscode-<platform>-<arch>`

Platform-specific builds.

```bash
gulp vscode-win32-x64
gulp vscode-darwin-arm64
gulp vscode-linux-x64
```

**What it does:**

1. Compiles with `compile-build-without-mangling`
2. Cleans extension build directory
3. Compiles extensions for build
4. Bundles VS Code
5. Packages for the target platform
6. Creates `VSCode-<platform>-<arch>` directory

**Output:** `../VSCode-<platform>-<arch>/` (outside the repo)

**Use when:** Creating a distributable build for a specific platform

#### 6. Platform-Specific Shortcuts

If you're on the same platform you're building for:

```bash
gulp vscode      # Build for current platform
gulp vscode-min  # Minified build for current platform
```

## How Build Tasks Work Under the Hood

### TypeScript Compilation Pipeline

VS Code uses a custom TypeScript builder located in [build/lib/tsb/](../build/lib/tsb/).

#### 1. TSB (TypeScript Builder)

**Location:** [build/lib/tsb/index.js](../build/lib/tsb/index.js)

**Key Features:**

- **Incremental compilation** - Only recompiles changed files
- **Project references** - Handles TypeScript project references
- **Three modes:**
  1. **Full compilation** - Type checking + emit
  2. **Transpile-only** - Fast transpilation without type checking
  3. **Transpile with esbuild** - Fastest transpilation using esbuild

**How it works:**

```javascript
// From build/lib/compilation.js
function createCompile(
  src,
  { build, emitError, transpileOnly, preserveEnglish }
) {
  const tsb = require("./tsb");
  const projectPath = path.join(__dirname, "../../", src, "tsconfig.json");

  // Create compilation instance
  const compilation = tsb.create(
    projectPath,
    overrideOptions,
    {
      verbose: false,
      transpileOnly: Boolean(transpileOnly),
      transpileWithEsbuild:
        typeof transpileOnly !== "boolean" && transpileOnly.esbuild,
    },
    (err) => reporter(err)
  );

  // Return pipeline that processes files
  return pipeline;
}
```

The compilation pipeline:

1. **Input** - Source TypeScript files
2. **Load sourcemaps** - If existing sourcemaps are present
3. **Compile** - TSB processes files
4. **NLS processing** - Extract/replace localization strings
5. **Sourcemaps** - Write sourcemaps
6. **Output** - JavaScript files

#### 2. Builder ([build/lib/tsb/builder.js](../build/lib/tsb/builder.js))

The incremental builder:

- Maintains a **project graph** of file dependencies
- Tracks **file modification times**
- Only recompiles files that changed or depend on changed files
- Handles **TypeScript diagnostics** (syntax and semantic errors)

#### 3. Transpiler ([build/lib/tsb/transpiler.js](../build/lib/tsb/transpiler.js))

For fast transpilation:

- Uses TypeScript's `transpileModule` API (no type checking)
- Can use esbuild for even faster transpilation
- Useful for development where type checking happens separately (e.g., in VS Code's editor)

### Bundling Pipeline

VS Code uses **esbuild** for bundling (replaced the old AMD loader approach).

#### Location: [build/lib/optimize.js](../build/lib/optimize.js)

**Key function:** `bundleTask(opts)`

**What it does:**

1. **Entry Point Resolution**

   - Reads entry points from [buildfile.js](../build/buildfile.js)
   - Examples: `vs/workbench/workbench.desktop.main`, `vs/editor/editor.worker`

2. **esbuild Configuration**

   ```javascript
   esbuild.build({
     bundle: true,
     packages: "external", // Don't bundle node_modules
     platform: "neutral", // ESM output
     format: "esm",
     sourcemap: "external",
     target: ["es2022"],
     // Custom plugins for TS boilerplate removal, content mapping
   });
   ```

3. **TypeScript Boilerplate Removal**

   - Removes TypeScript helper functions (they're in tslib banner)
   - Reduces bundle size significantly

4. **Content Mapping**

   - Allows custom transformations during bundling
   - Used for product-specific replacements

5. **Output**
   - Bundled `.js` files
   - External `.js.map` sourcemaps
   - Media assets in `media/` subfolder

### Minification Pipeline

**Location:** [build/lib/optimize.js](../build/lib/optimize.js) - `minifyTask(src, sourceMappingURLBase)`

Uses **esbuild** for minification:

```javascript
esbuild.build({
  entryPoints: ["file.js"],
  minify: true,
  sourcemap: "external",
  format: "esm",
  target: ["es2022"],
});
```

**Additional steps:**

- Rewrites sourcemap URLs to CDN location
- Preserves copyright headers
- Outputs to `*-min` directories

### Mangling Pipeline

**Location:** [build/lib/mangle/](../build/lib/mangle/)

**Purpose:** Reduce code size by shortening private identifiers

**What gets mangled:**

- Private class fields (e.g., `#_myField` → `#a`)
- Private methods
- Optionally: exported symbols that are internal

**How it works:**

1. Uses TypeScript compiler API to build project graph
2. Identifies private/internal symbols
3. Generates shortened names
4. Rewrites source files with new names
5. Updates sourcemaps

**Important:** Only used in production builds (CI), not PR builds

### Extension Compilation

**Location:** [build/gulpfile.extensions.js](../build/gulpfile.extensions.js)

Extensions are compiled **individually**, each with its own:

- `tsconfig.json`
- Source directory (`src/`)
- Output directory (`out/`)

**Process:**

1. **For each extension** (defined in `compilations` array):

   ```javascript
   const tasks = compilations.map((tsconfigFile) => {
     // Create pipelines for this extension
     return { transpileTask, compileTask, watchTask, compileBuildTask };
   });
   ```

2. **Create TSB instance** per extension

   - Reads extension's `tsconfig.json`
   - Creates isolated compilation context

3. **Pipeline:**

   - Filter TypeScript files
   - Run through TSB
   - Copy non-TS files (unchanged)
   - Write sourcemaps
   - Output to extension's `out/` directory

4. **Aggregate tasks:**
   - `compile-extensions` runs all individual compile tasks in parallel
   - `watch-extensions` runs all individual watch tasks in parallel

### Extension Packaging for Distribution

**Location:** [build/lib/extensions.js](../build/lib/extensions.js)

**Process:**

1. **Marketplace Extensions**

   - Downloads extensions from VS Marketplace
   - Uses `@vscode/vsce` to package

2. **Local Extensions**

   - Separates into **native** (with .node modules) and **non-native**
   - Packages using `@vscode/vsce`
   - Outputs to `.build/extensions/`

3. **Extension Media**
   - Bundles extension media files (icons, images)
   - Uses webpack for some extensions

### NLS (Localization) Processing

**Location:** [build/lib/nls.js](../build/lib/nls.js)

**How it works:**

1. **During compilation:**

   - Finds calls to `nls.localize('key', 'Default text')`
   - Extracts keys and messages
   - Generates `nls.metadata.json`

2. **For production builds:**

   - Replaces `nls.localize()` calls with direct lookups
   - Bundles translations into separate files
   - Creates language packs

3. **Key files:**
   - `nls.messages.json` - All localizable messages
   - `nls.keys.json` - Message keys
   - `nls.metadata.json` - Metadata for localization tools

### Task Infrastructure

**Location:** [build/lib/task.js](../build/lib/task.js)

VS Code has a custom task system that wraps Gulp tasks with:

#### `task.define(name, taskFunction)`

Defines a named task with logging.

```javascript
const myTask = task.define("my-task", () => {
  // Task implementation
});
gulp.task(myTask);
```

**Features:**

- Automatic timing and logging
- Colored console output
- Task name tracking

#### `task.series(...tasks)`

Run tasks sequentially.

```javascript
const buildTask = task.series(cleanTask, compileTask, bundleTask);
```

#### `task.parallel(...tasks)`

Run tasks in parallel.

```javascript
const watchTask = task.parallel(watchClientTask, watchExtensionsTask);
```

**Implementation:**

- Uses async/await for orchestration
- Handles promises, streams, and callbacks
- Provides detailed timing information

## Build Infrastructure

### Key Utilities

#### [build/lib/util.js](../build/lib/util.js)

Common utilities used throughout the build:

- **`rimraf(path)`** - Delete directory task
- **`filter(predicate)`** - Filter files in stream
- **`incremental(compile, src, watch)`** - Incremental compilation helper
- **`loadSourcemaps()`** - Load existing sourcemaps
- **`stripSourceMappingURL()`** - Remove sourcemap comments
- **`rewriteSourceMappingURL(base)`** - Rewrite sourcemap URLs

#### [build/lib/watch/](../build/lib/watch/)

File watching system:

- Platform-specific watchers (optimized for Windows)
- Debouncing and batching
- Handles file system events
- Integrates with incremental compilation

#### [build/lib/i18n.js](../build/lib/i18n.js)

Internationalization infrastructure:

- Exports strings for translation (`.xlf` format)
- Imports translated strings
- Generates language packs
- Default languages: cs, de, es, fr, it, ja, ko, pl, pt-br, ru, tr, zh-cn, zh-tw

#### [build/lib/dependencies.js](../build/lib/dependencies.js)

Production dependency management:

- Analyzes `package.json` dependencies
- Identifies production vs dev dependencies
- Used when packaging node_modules

#### [build/lib/asar.js](../build/lib/asar.js)

ASAR archive creation:

- Packages node_modules into `.asar` files
- Reduces file count for distribution
- Excludes certain files (.node binaries, specific modules)

### Entry Points

**Location:** [build/buildfile.js](../build/buildfile.js)

Defines bundle entry points:

```javascript
exports.workerEditor = "vs/editor/common/services/editorWebWorkerMain";
exports.workerExtensionHost = "vs/workbench/api/worker/extensionHostWorkerMain";
exports.workbenchDesktop = [
  "vs/workbench/contrib/debug/node/telemetryApp",
  "vs/platform/files/node/watcher/watcherMain",
  "vs/platform/terminal/node/ptyHostMain",
  "vs/workbench/api/node/extensionHostProcess",
  "vs/workbench/workbench.desktop.main",
];
exports.code = [
  "vs/code/node/cliProcessMain",
  "vs/code/electron-utility/sharedProcess/sharedProcessMain",
  "vs/code/electron-browser/workbench/workbench",
];
```

These are used by the bundling pipeline to determine what to bundle.

## Common Workflows

### Starting Development

```bash
# Install dependencies
npm install

# Start watch mode (recommended)
gulp watch
# or use VS Code task: "VS Code - Build" (Ctrl+Shift+B)

# In another terminal, run VS Code from source
./scripts/code.sh  # or .\scripts\code.bat on Windows
```

### One-Time Build

```bash
# Full compilation
gulp compile

# Or specific parts
gulp compile-client
gulp compile-extensions
```

### Building for Production

```bash
# CI build (with mangling)
gulp core-ci

# Platform-specific package
gulp vscode-win32-x64-min
```

### Working on Extensions

```bash
# Watch a specific extension
gulp watch-extension:git

# Compile a specific extension
gulp compile-extension:typescript-language-features

# Compile all extensions
gulp compile-extensions
```

### Code Quality Checks

```bash
# Run hygiene checks
gulp hygiene

# Validate package.json files
gulp check-package-json
```

### Monaco Editor Development

```bash
# Extract Monaco sources
gulp extract-editor-src

# Compile Monaco Editor
gulp compile-editor-esm

# Generate monaco.d.ts
gulp monacodts
```

### Debugging Build Issues

1. **Check TypeScript errors:**

   - Look at "VS Code - Build" task output
   - Errors are reported in real-time during watch

2. **Clean build:**

   ```bash
   # Remove output directories
   rm -rf out/ out-build/ out-vscode/

   # Rebuild
   gulp compile
   ```

3. **Verbose output:**

   - Set `verbose: true` in compilation options
   - Check build logs for detailed timing

4. **Individual tasks:**

   ```bash
   # Test specific compilation
   gulp compile-client

   # Test specific extension
   gulp compile-extension:git
   ```

### Performance Tips

- **Use watch mode** during development (incremental is much faster)
- **Transpile-only mode** for quick builds (no type checking)
- **Parallel compilation** is enabled by default for extensions
- **esbuild transpilation** is the fastest (used in some tasks)

## Summary

The VS Code Gulp build system is a sophisticated, multi-stage pipeline that:

1. **Compiles** TypeScript to JavaScript using a custom incremental builder
2. **Bundles** code with esbuild for optimal loading performance
3. **Minifies** and optimizes for production builds
4. **Packages** for multiple platforms and deployment scenarios
5. **Validates** code quality and consistency
6. **Supports** both development (fast iteration) and production (optimized output) workflows

Key design principles:

- **Modularity** - Separate gulpfiles for different concerns
- **Incremental** - Fast rebuilds during development
- **Parallel** - Maximum parallelization for compilation
- **Flexible** - Multiple build targets (desktop, web, remote, editor)
- **Production-ready** - Sophisticated optimization for releases

The system balances developer experience (fast incremental builds) with production requirements (optimized, minified, mangled code).

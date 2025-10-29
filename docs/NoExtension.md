# Building VS Code Without Extensions

This document explains how to build VS Code while skipping the extension installation, compilation, and packaging steps. This can be useful for faster builds when you only need the core editor functionality or when working on core VS Code features.

## Overview

VS Code's build system handles extensions through three main stages:

1. **Installation** - Running `npm install` in extension directories
2. **Compilation** - Building TypeScript and bundling extension code
3. **Packaging** - Including extensions in the final VS Code package

## 1. Skipping `npm install` in Extension Directories

### How it Currently Works

The postinstall script ([build/npm/postinstall.js](../build/npm/postinstall.js)) runs `npm install` in directories listed in [build/npm/dirs.js](../build/npm/dirs.js):

```javascript
const dirs = [
  "", // Root directory
  "build", // Build tools
  "extensions", // All extensions (runs npm install at extensions/ level)
  "test/automation",
  "test/integration/browser",
  "test/smoke",
  // ...
];
```

### Solution: Modify dirs.js

To skip extension dependencies installation, edit [build/npm/dirs.js](../build/npm/dirs.js#L9-L59):

#### Option 1: Remove the extensions directory entirely

```javascript
const dirs = [
  "",
  "build",
  // 'extensions',  // Comment out or remove this line
  "test/automation",
  // ...
];
```

#### Option 2: Install only specific extensions

Uncomment specific extension directories you need:

```javascript
const dirs = [
  "",
  "build",
  // 'extensions',  // Remove this
  "extensions/typescript-language-features", // Only install TypeScript extension
  "extensions/json-language-features", // And JSON extension
  // ...
];
```

**Notes:**

- The root `extensions/` directory has a `package.json` that manages shared dependencies for all extensions
- Individual extensions may also have their own `package.json` files
- The file already contains a commented-out list of all individual extension directories (lines 13-49) that you can selectively uncomment

## 2. Skipping Extension Build/Compilation

### How it Works

Extension compilation is defined in [build/gulpfile.extensions.js](../build/gulpfile.extensions.js). This file:

- Creates gulp tasks for each extension's TypeScript compilation
- Defines tasks like `compile-extensions`, `watch-extensions`, `compile-extension-media`
- Lists all extension `tsconfig.json` files to compile (lines 30-73)

The main build tasks are defined in [build/gulpfile.js](../build/gulpfile.js):

```javascript
const _compileTask = task.define(
  "compile",
  task.parallel(
    monacoTypecheckTask,
    compileClientTask,
    compileExtensionsTask,
    compileExtensionMediaTask
  )
);
```

### Solution: Use Core-Only Build Tasks

**For development (watching changes):**

Instead of running `npm run watch` or the "VS Code - Build" task, use:

```bash
npm run watch-client
```

Or use the VS Code task:

- Run task: "Core - Build" (instead of "VS Code - Build")

This runs only:

- `watch-client` - Watches and compiles `src/` (core VS Code)

And skips:

- `watch-extensions` - Extension TypeScript compilation
- `watch-extension-media` - Extension media/webpack bundling

**For one-time compilation:**

Instead of `npm run compile`, use:

```bash
npm run compile-client
```

This compiles only the core VS Code source in `src/`, not extensions.

**Relevant npm scripts from [package.json](../package.json#L12-L72):**

- `compile-client` - Compile only core VS Code (src/)
- `watch-client` - Watch mode for core only
- `compile` - Compiles everything (core + extensions)
- `watch` - Watches everything (core + extensions)

## 3. Skipping Extension Packaging

### How Packaging Works

When creating a distributable package, extensions are included from the `.build/extensions/` directory. This is handled in [build/gulpfile.vscode.js](../build/gulpfile.vscode.js#L244):

```javascript
const extensions = gulp.src(
  [".build/extensions/**", ...platformSpecificBuiltInExtensionsExclusions],
  { base: ".build", dot: true }
);
```

Extensions are packaged into `.build/extensions/` by these gulp tasks defined in [build/gulpfile.extensions.js](../build/gulpfile.extensions.js):

- `compile-extensions-build` - Packages all local extensions
- `compile-non-native-extensions-build` - Packages non-native extensions
- `compile-native-extensions-build` - Packages native extensions

Built-in extensions from the marketplace are downloaded by:

```bash
npm run download-builtin-extensions
```

This reads the `builtInExtensions` list from [product.json](../product.json#L36-L85) and downloads them.

### Solution: Skip Extension Packaging Tasks

**For CI/CD or production builds:**

The complete build process normally involves:

```bash
npm run compile-build          # Compile core with optimizations
npm run compile-extensions-build  # Package all extensions
npm run minify-vscode          # Minify and bundle
# Then platform-specific packaging
```

To build without extensions:

1. **Skip the extension build task:**

   ```bash
   npm run compile-build          # Compile core only
   # Skip: npm run compile-extensions-build
   npm run minify-vscode          # Minify core
   ```

2. **Don't run download-builtin-extensions:**

   ```bash
   # Skip: npm run download-builtin-extensions
   ```

3. **Ensure .build/extensions/ is empty or doesn't exist:**

   ```bash
   # On Unix/macOS
   rm -rf .build/extensions

   # On Windows
   rmdir /s /q .build\extensions
   ```

**Modify product.json (optional):**

To prevent built-in extensions from being downloaded, edit [product.json](../product.json#L36) and remove or empty the `builtInExtensions` array:

```json
{
  "builtInExtensions": []
}
```

## Complete Workflow: Building Without Extensions

### Development Workflow

1. **Initial setup (skip extension npm install):**

   ```bash
   # Edit build/npm/dirs.js to remove 'extensions' from the dirs array
   npm install
   ```

2. **Development build:**

   ```bash
   npm run watch-client
   # Or use VS Code task: "Core - Build"
   ```

3. **Run VS Code:**

   ```bash
   ./scripts/code.sh
   # Or on Windows: .\scripts\code.bat
   ```

### Production Build Workflow

1. **Edit build/npm/dirs.js** to remove `'extensions'`
2. **Optional: Edit product.json** to set `"builtInExtensions": []`
3. **Clean and install:**

   ```bash
   npm install
   ```

4. **Build core:**

   ```bash
   npm run compile-build
   ```

5. **Skip extension tasks** (don't run these):
   - `npm run compile-extensions-build`
   - `npm run download-builtin-extensions`
6. **Bundle and package:**

   ```bash
   npm run minify-vscode
   # Continue with platform-specific packaging
   ```

## Key Files Reference

| File                                                            | Purpose                                        | Line References              |
| --------------------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| [build/npm/dirs.js](../build/npm/dirs.js)                       | Controls which directories run `npm install`   | Lines 9-67                   |
| [build/npm/postinstall.js](../build/npm/postinstall.js)         | Runs `npm install` in directories from dirs.js | Lines 131-186                |
| [build/gulpfile.extensions.js](../build/gulpfile.extensions.js) | Extension compilation tasks                    | Entire file                  |
| [build/gulpfile.js](../build/gulpfile.js)                       | Main build orchestration                       | Lines 38-41 (compile task)   |
| [build/gulpfile.vscode.js](../build/gulpfile.vscode.js)         | Packaging logic that includes extensions       | Line 244 (extensions source) |
| [product.json](../product.json)                                 | Defines built-in extensions to download        | Lines 36-85                  |
| [package.json](../package.json)                                 | npm scripts for building                       | Lines 20-62                  |

## Environment Variables

Currently, there are no built-in environment variables to skip extension building. The only extension-related environment variable found is:

- `VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE` - Silences logging during built-in extension downloads ([build/lib/builtInExtensions.ts](../build/lib/builtInExtensions.ts#L42))

## Limitations and Considerations

1. **Missing Built-in Functionality**: Many VS Code features depend on built-in extensions (e.g., Git, Markdown, TypeScript). Without extensions, VS Code will have reduced functionality.

2. **Testing**: Some integration tests expect extensions to be present. Test scripts may fail or need adjustment.

3. **Extension Host**: The extension host will still load, but won't have any extensions to activate.

4. **First-time Setup**: Even if you skip extension installation, VS Code can still download and install extensions from the marketplace at runtime if configured.

## Alternative: Include Only Specific Extensions

Instead of building with no extensions, you might want to build with only a subset:

1. Edit [build/npm/dirs.js](../build/npm/dirs.js) to include only needed extensions
2. Edit [build/gulpfile.extensions.js](../build/gulpfile.extensions.js) lines 30-73 to include only needed tsconfig.json files
3. Edit [product.json](../product.json) to include only needed built-in extensions

This gives you a lighter build while maintaining essential functionality.

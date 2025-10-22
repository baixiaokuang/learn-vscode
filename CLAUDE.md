# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Visual Studio Code is a cross-platform code editor built with TypeScript, Electron, and web technologies. This is the "Code - OSS" repository where the open-source core is developed.

## Development Commands

### Building and Watching

**Primary development workflow:**

- Run the `VS Code - Build` task from VS Code's task runner to start incremental compilation
  - This runs both `Core - Build` (for `src/`) and `Ext - Build` (for `extensions/`)
  - Uses `npm run watch-clientd` and `npm run watch-extensionsd` under the hood
  - Watch tasks run in the background using `deemon`
- **CRITICAL**: Always check the `VS Code - Build` task output for TypeScript compilation errors before running tests or scripts
- Kill watch tasks: `Kill VS Code - Build` task

**Manual compilation:**

- `npm run compile` - One-time compilation of all TypeScript
- `npm run compile-web` - Compile for web
- `npm run watch-web` - Watch mode for web extensions

### Running VS Code

- `./scripts/code.sh` (or `.\scripts\code.bat` on Windows) - Launch VS Code from source
- `./scripts/code-web.sh` (or `.\scripts\code-web.bat`) - Launch web version
- `./scripts/code-server.sh` (or `.\scripts\code-server.bat`) - Launch remote server

### Testing

**Unit tests:**

- `./scripts/test.sh` (or `.\scripts\test.bat` on Windows) - Run unit tests
- Add `--grep <pattern>` to filter tests
- Single test: `./scripts/test.sh --grep "test name pattern"`

**Integration tests:**

- `./scripts/test-integration.sh` (or `.\scripts\test-integration.bat`) - Run all integration tests
- Tests API, extensions (TypeScript, Markdown, Git, Emmet, etc.)

**Browser tests:**

- `npm run test-browser` - Run unit tests in browser (installs Playwright)
- `npm run test-browser-no-install` - Skip Playwright installation

**Web integration:**

- `./scripts/test-web-integration.sh` - Web-specific integration tests

**Extension tests:**

- `npm run test-extension -- -l <extension-name>` - Test specific extension

### Code Quality

- `npm run eslint` - Run ESLint on the codebase
- `npm run hygiene` - Run hygiene checks (formatting, headers, etc.)
- `npm run valid-layers-check` - Verify architectural layering rules
- `npm run tsec-compile-check` - Run Trusted Types security checker
- `npm run monaco-compile-check` - Check Monaco editor compilation
- `npm run vscode-dts-compile-check` - Validate VS Code API definitions

### Dependencies

- `npm install` or `npm i` - Install dependencies (has pre/post install hooks)
- `npm run download-builtin-extensions` - Download built-in extensions
- `npm run electron` - Download Electron binary

## Architecture Overview

### Core Layers (src/vs/)

VS Code follows a **strict layered architecture**:

1. **`src/vs/base/`** - Foundation layer

   - Platform-agnostic utilities, data structures, and abstractions
   - No dependencies on other VS Code layers
   - Common patterns: async utilities, collections, events, lifecycle management

2. **`src/vs/platform/`** - Platform services layer

   - Cross-platform service abstractions
   - Dependency injection infrastructure
   - Services: configuration, files, telemetry, storage, etc.
   - Platform-specific implementations for Electron, web, and server

3. **`src/vs/editor/`** - Text editor layer

   - Monaco Editor implementation
   - Standalone editor that can be used outside VS Code
   - Language services, syntax highlighting, completions, etc.
   - No dependencies on workbench

4. **`src/vs/workbench/`** - Application layer

   - Main VS Code application UI and features
   - Sub-structure:
     - `workbench/browser/` - Core workbench UI (parts, layout, actions)
     - `workbench/services/` - Workbench-level service implementations
     - `workbench/contrib/` - Feature contributions (git, debug, search, terminal, chat, etc.)
     - `workbench/api/` - Extension host and VS Code Extension API implementation

5. **`src/vs/code/`** - Electron main process

   - Desktop-specific entry points and main process code

6. **`src/vs/server/`** - Remote server implementation
   - Code for running VS Code as a remote server

### Key Architectural Patterns

**Dependency Injection:**

- Services are injected via constructor parameters
- Use decorators like `@IServiceName` for injection
- Services are registered in service collections

**Contribution Points:**

- Features register themselves in contribution registries
- Examples: commands, menu items, views, languages, themes
- Enables modular feature development

**Cross-Platform Abstractions:**

- Platform-specific code is isolated behind interfaces
- Check `src/vs/base/common/` vs `src/vs/base/browser/` vs `src/vs/base/node/`

### Extensions Directory

Built-in extensions live in `extensions/`:

- **Language features**: `typescript-language-features/`, `html-language-features/`, `css-language-features/`, `json-language-features/`, etc.
- **Core features**: `git/`, `emmet/`, `markdown-language-features/`, `debug-auto-launch/`
- **Themes**: `theme-*` folders
- Each extension has standard structure: `package.json`, `src/`, contribution points

### Build System

- **Gulp** - Main build orchestration (`gulpfile.js` → `build/gulpfile.js`)
- **TypeScript** - Custom incremental builder in `build/lib/tsb/`
- **Webpack** - Used for bundling extensions
- Entry points: `src/main.ts` (Electron main), `src/bootstrap-*.ts` files

### Test Structure

- `test/unit/` - Unit tests (browser and Node.js)
- `test/integration/` - Integration tests
- `test/smoke/` - End-to-end smoke tests
- `test/automation/` - Automation library for UI tests
- Unit tests are co-located with source: `src/vs/*/test/`

## Coding Standards

### Style Rules

- **Indentation**: Tabs, not spaces
- **Naming**:
  - `PascalCase` for types and enum values
  - `camelCase` for functions, methods, properties, variables
- **Strings**:
  - "double quotes" for user-facing strings (need localization)
  - 'single quotes' for internal strings
- **Functions**: Prefer `export function name() {}` over `export const name = () => {}` in top-level scopes (better stack traces)
- **Arrow functions**: Only use parens when necessary: `x => x + x` not `(x) => x + x`
- **Braces**: Always use for loops/conditionals, open on same line
- **Async**: Prefer `async/await` over `.then()` chains

### Code Quality Requirements

- **Copyright header**: All files must include Microsoft copyright header
- **Localization**: All user-facing strings must be localized using `nls.localize()`
- **Comments**: Use JSDoc for functions, interfaces, enums, and classes
- **Layering**: Respect architectural layers - use `npm run valid-layers-check` to verify
- **Test placement**: Add tests to appropriate suites, not end of files

### UI Labels

- Use title-style capitalization for commands, buttons, menu items
- Don't capitalize prepositions of 4 or fewer letters unless first/last word

## Development Workflow

### Before Starting

1. Run `npm install` to get dependencies
2. Start `VS Code - Build` task for incremental compilation
3. Monitor the task output for compilation errors

### TypeScript Compilation

**CRITICAL RULE**: Never proceed with tests or scripts if there are TypeScript compilation errors.

1. **Always** check `VS Code - Build` task output for errors
2. **Never** run tests with compilation errors
3. Fix all errors before moving forward
4. The build task runs incrementally as you edit files

### Making Changes

1. Make code changes in `src/` or `extensions/`
2. Watch task automatically recompiles
3. Check task output for errors
4. Run relevant tests: `./scripts/test.sh --grep "pattern"`
5. Run hygiene/layering checks before committing

### Finding Code

1. **Semantic search**: Use file search for concepts/feature areas
2. **Exact matches**: Use grep for error messages, function names, strings
3. **Follow imports**: Check what files import a module to understand usage
4. **Tests**: Look at test files (`*/test/`) to understand behavior
5. **Contributions**: Search for registry calls to find where features are registered

## Common Patterns

### Service Injection

```typescript
constructor(
	@IConfigurationService private readonly configurationService: IConfigurationService,
	@IFileService private readonly fileService: IFileService
) {}
```

### Contributing Features

```typescript
// Register command
CommandsRegistry.registerCommand(id, handler);

// Register view
registerSingleton(IViewsService, ViewsService);
```

### Localization

```typescript
import * as nls from "vs/nls";
const message = nls.localize("key", "Default message");
```

### Platform-specific Code

- `src/vs/base/common/` - Platform-agnostic code
- `src/vs/base/browser/` - Browser/renderer process
- `src/vs/base/node/` - Node.js/main process
- `src/vs/base/electron-main/` - Electron main process

## Repository Details

- **Version**: 1.104.x (check `package.json`)
- **License**: MIT
- **Node version**: Check `.nvmrc` or `package.json` engines
- **Main branch**: `main`
- **Release branches**: `release/1.x`

# DTS Lifecycle in VS Code

This document provides a comprehensive overview of how TypeScript definition files (DTS) work in VS Code, covering the full lifecycle from creation to consumption.

## Overview

VS Code's extension API is defined through TypeScript definition files located in [src/vscode-dts/](../src/vscode-dts/). The system consists of:

- **Stable API**: [vscode.d.ts](../src/vscode-dts/vscode.d.ts) - The public, stable extension API
- **Proposed APIs**: `vscode.proposed.*.d.ts` files - Experimental APIs under evaluation

## Architecture

### 1. DTS File Structure

```txt
src/vscode-dts/
├── vscode.d.ts                              # Stable API (published to npm as @types/vscode)
├── vscode.proposed.activeComment.d.ts       # Individual proposal files
├── vscode.proposed.chatParticipantAdditions.d.ts
├── vscode.proposed.languageModelSystem.d.ts
└── ... (100+ proposal files)
```

Each file follows this structure:

```typescript
// vscode.d.ts - Stable API
declare module 'vscode' {
    export const version: string;
    export interface Command { ... }
    export interface TextDocument { ... }
    // ... stable API definitions
}

// vscode.proposed.*.d.ts - Proposed API
declare module 'vscode' {
    // version: 2  (optional version comment for tracking)
    export interface NewFeature { ... }
    // Augments the vscode module with new APIs
}
```

## Lifecycle Stages

### Stage 1: Creating a Proposal

When adding a new API, developers create a proposal file:

**File naming convention**: `vscode.proposed.[proposalName].d.ts`

**Steps**:

1. Create a new file in [src/vscode-dts/](../src/vscode-dts/)
2. The name must match pattern: `vscode.proposed.[a-zA-Z]+.d.ts`
3. Optionally include a version comment: `// version: N`
4. Define the API using TypeScript module augmentation

**Example**: [src/vscode-dts/vscode.proposed.chatParticipantAdditions.d.ts](../src/vscode-dts/vscode.proposed.chatParticipantAdditions.d.ts)

```typescript
declare module "vscode" {
  export interface ChatParticipant {
    onDidPerformAction: Event<ChatUserActionEvent>;
  }

  export class ChatResponseTextEditPart {
    uri: Uri;
    edits: TextEdit[];
    constructor(uri: Uri, edits: TextEdit | TextEdit[]);
  }
}
```

### Stage 2: Auto-Generation of Proposal Registry

When you create or modify a proposal file, the build system automatically generates [src/vs/platform/extensions/common/extensionsApiProposals.ts](../src/vs/platform/extensions/common/extensionsApiProposals.ts).

**Build Process**:

The [build/lib/compilation.js](../build/lib/compilation.js) file contains `generateApiProposalNames()` which:

1. Scans all `vscode.proposed.*.d.ts` files
2. Extracts proposal names using regex: `/vscode\.proposed\.([a-zA-Z\d]+)\.d\.ts$/`
3. Looks for version comments: `/^\s*\/\/\s*version\s*:\s*(\d+)\s*$/mi`
4. Generates a TypeScript file mapping proposal names to GitHub URLs

**Generated Output**:

```typescript
// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.

const _allApiProposals = {
  chatParticipantAdditions: {
    proposal:
      "https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.chatParticipantAdditions.d.ts",
  },
  languageModelThinkingPart: {
    proposal:
      "https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.languageModelThinkingPart.d.ts",
    version: 1,
  },
  // ... all proposals
};
export const allApiProposals = Object.freeze(_allApiProposals);
export type ApiProposalName = keyof typeof _allApiProposals;
```

**Gulp Tasks**:

- `compile-api-proposal-names`: One-time generation
- `watch-api-proposal-names`: Watches for changes and regenerates
- Runs automatically when using `npm run watch` or the "VS Code - Build" task

### Stage 3: API Implementation

Developers implement the proposed API in the extension host.

**Key Files**:

- [src/vs/workbench/api/common/extHost.api.impl.ts](../src/vs/workbench/api/common/extHost.api.impl.ts) - Main API factory
- Various `extHost*.ts` files for specific features

**Implementation Pattern**:

```typescript
// In extHost.api.impl.ts or feature-specific file
const api: typeof vscode = {
  languages: {
    registerNewSymbolNamesProvider(selector, provider) {
      // Check if extension has enabled this proposal
      checkProposedApiEnabled(extension, "newSymbolNamesProvider");
      return extHostLanguageFeatures.registerNewSymbolNamesProvider(
        extension,
        checkSelector(selector),
        provider
      );
    },
  },
};
```

**Enforcement Functions**:

- `checkProposedApiEnabled(extension, proposalName)` - Throws error if not enabled
- `isProposedApiEnabled(extension, proposalName)` - Returns boolean

Located in [src/vs/workbench/services/extensions/common/extensions.ts](../src/vs/workbench/services/extensions/common/extensions.ts).

### Stage 4: Extension Opt-In

Extensions must explicitly declare which proposals they want to use in their `package.json`.

**Extension Configuration**:

```json
{
  "name": "my-extension",
  "enabledApiProposals": [
    "chatParticipantAdditions",
    "languageModelSystem",
    "newSymbolNamesProvider"
  ]
}
```

**Access Control System**:

The [src/vs/workbench/services/extensions/common/extensionsProposedApi.ts](../src/vs/workbench/services/extensions/common/extensionsProposedApi.ts) class manages proposal access:

```typescript
class ExtensionsProposedApi {
  // Three levels of enablement:

  // 1. Development Mode: All proposals available
  private _envEnablesProposedApiForAll: boolean;

  // 2. CLI Flag: --enable-proposed-api=extensionId
  private _envEnabledExtensions: Set<string>;

  // 3. Product Configuration: product.json#extensionEnabledApiProposals
  private _productEnabledExtensions: Map<string, ApiProposalName[]>;
}
```

**Validation Logic**:

1. If running from source (`!isBuilt`): All proposals enabled
2. If `--enable-proposed-api` flag: Specified extensions can use proposals
3. If in `product.json`: Only listed proposals for that extension
4. Otherwise: Non-builtin extensions cannot use proposals

**Example from vscode-api-tests**: [extensions/vscode-api-tests/package.json](../extensions/vscode-api-tests/package.json)

### Stage 5: Compilation Validation

VS Code has dedicated TypeScript checks to validate DTS files.

**Validation Scripts** (from [package.json](../package.json)):

```bash
# Check stable API compiles correctly
npm run vscode-dts-compile-check

# Internally runs:
tsgo --project src/tsconfig.vscode-dts.json &&
tsgo --project src/tsconfig.vscode-proposed-dts.json
```

**TypeScript Configs**:

[src/tsconfig.vscode-dts.json](../src/tsconfig.vscode-dts.json) - Validates stable API only:

```json
{
  "compilerOptions": {
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true
  },
  "include": ["vscode-dts/vscode.d.ts"]
}
```

[src/tsconfig.vscode-proposed-dts.json](../src/tsconfig.vscode-proposed-dts.json) - Validates all APIs:

```json
{
  "extends": "./tsconfig.vscode-dts.json",
  "include": ["vscode-dts/vscode.d.ts", "vscode-dts/vscode.proposed.*.d.ts"]
}
```

These checks ensure:

- No TypeScript compilation errors
- Proper type safety
- No conflicts between proposals
- All APIs use correct TypeScript patterns

### Stage 6: API Graduation (Proposal → Stable)

When a proposal is deemed stable:

1. **Move definitions** from `vscode.proposed.*.d.ts` to `vscode.d.ts`
2. **Remove proposal file** (or mark deprecated)
3. **Update implementations** to remove `checkProposedApiEnabled()` calls
4. **Update extensionsApiProposals.ts** (auto-generated)
5. **Update changelog and documentation**

**Important**: Extensions using the graduated API can remove it from `enabledApiProposals` but it's backward compatible to keep it listed.

### Stage 7: Publishing

The stable `vscode.d.ts` is published to npm as `@types/vscode`.

**Publishing Process**:

[build/azure-pipelines/publish-types/update-types.js](../build/azure-pipelines/publish-types/update-types.js) handles publishing:

```javascript
// 1. Get the latest release tag
const tag = execSync("git describe --tags `git rev-list --tags --max-count=1`");

// 2. Download vscode.d.ts from that tag
const dtsUri = `https://raw.githubusercontent.com/microsoft/vscode/${tag}/src/vscode-dts/vscode.d.ts`;

// 3. Update DefinitelyTyped
const outPath = "DefinitelyTyped/types/vscode/index.d.ts";
execSync(`curl ${dtsUri} --output ${outPath}`);

// 4. Add DefinitelyTyped header with version info
updateDTSFile(outPath, tag);
```

**Published Package**:

- **Registry**: npm/@types/vscode
- **Version**: Matches VS Code version (e.g., `1.85.0`)
- **Content**: Only stable APIs (no proposals)
- **Usage**: `npm install --save-dev @types/vscode@^1.85.0`

### Stage 8: Extension Developer Consumption

**For Stable APIs**:

Extension developers install the types:

```bash
npm install --save-dev @types/vscode@^1.85.0
```

Then use in code:

```typescript
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("Hello!");
}
```

**For Proposed APIs**:

Developers use the `vscode-dts` CLI tool:

```bash
# 1. Add proposals to package.json
{
  "enabledApiProposals": ["chatParticipantAdditions"]
}

# 2. Download proposal definitions
npx vscode-dts dev

# 3. Use in code
import * as vscode from 'vscode';
// Now ChatResponseTextEditPart is available
```

**Important Limitations**:

- Extensions using proposed APIs **cannot be published** to the marketplace
- Proposals can break or change at any time
- Only for development/testing or Microsoft's built-in extensions

## Key Files Reference

### DTS Files

- [src/vscode-dts/vscode.d.ts](../src/vscode-dts/vscode.d.ts) - Stable API definitions
- [src/vscode-dts/vscode.proposed.\*.d.ts](../src/vscode-dts/) - Proposal files
- [src/vscode-dts/README.md](../src/vscode-dts/README.md) - Proposal workflow guide

### Build & Generation

- [build/lib/compilation.js](../build/lib/compilation.js) - Generates proposal registry
- [src/vs/platform/extensions/common/extensionsApiProposals.ts](../src/vs/platform/extensions/common/extensionsApiProposals.ts) - Generated proposal map

### API Implementation

- [src/vs/workbench/api/common/extHost.api.impl.ts](../src/vs/workbench/api/common/extHost.api.impl.ts) - Main API factory
- [src/vs/workbench/api/common/extHost\*.ts](../src/vs/workbench/api/common/) - Feature implementations

### Access Control

- [src/vs/workbench/services/extensions/common/extensionsProposedApi.ts](../src/vs/workbench/services/extensions/common/extensionsProposedApi.ts) - Proposal enablement
- [src/vs/workbench/services/extensions/common/extensions.ts](../src/vs/workbench/services/extensions/common/extensions.ts) - Check functions

### Validation

- [src/tsconfig.vscode-dts.json](../src/tsconfig.vscode-dts.json) - Stable API validation
- [src/tsconfig.vscode-proposed-dts.json](../src/tsconfig.vscode-proposed-dts.json) - All APIs validation

### Publishing

- [build/azure-pipelines/publish-types/update-types.js](../build/azure-pipelines/publish-types/update-types.js) - npm publishing

## Data Flow Diagram

```txt
┌─────────────────────────────────────────────────────────────────┐
│ 1. PROPOSAL CREATION                                            │
│    Developer creates vscode.proposed.featureName.d.ts           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. AUTO-GENERATION (build/lib/compilation.js)                   │
│    Gulp task scans proposals → generates extensionsApiProposals │
│    Run via: npm run watch / compile-api-proposal-names          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. API IMPLEMENTATION                                           │
│    extHost.api.impl.ts implements features                      │
│    Uses checkProposedApiEnabled() for enforcement               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. EXTENSION OPT-IN                                             │
│    Extensions add to package.json#enabledApiProposals           │
│    ExtensionsProposedApi validates access at runtime            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. VALIDATION                                                   │
│    npm run vscode-dts-compile-check                             │
│    Ensures type safety and correctness                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. GRADUATION (when stable)                                     │
│    Move to vscode.d.ts → Remove proposal file                   │
│    Remove checkProposedApiEnabled calls                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. PUBLISHING                                                   │
│    Azure Pipeline: update-types.js                              │
│    Publishes to @types/vscode on npm                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. CONSUMPTION                                                  │
│    Extensions: npm install @types/vscode                        │
│    Proposals: npx vscode-dts dev                                │
└─────────────────────────────────────────────────────────────────┘
```

## Best Practices

### For VS Code Core Developers

**Creating Proposals**:

1. Name proposals descriptively (e.g., `chatParticipantAdditions` not `chat2`)
2. Include version comments for tracking breaking changes
3. Document the proposal thoroughly with JSDoc
4. Add corresponding tests to [extensions/vscode-api-tests](../extensions/vscode-api-tests/)

**Implementing APIs**:

1. Always use `checkProposedApiEnabled()` for runtime enforcement
2. Keep proposal scope narrow and focused
3. Avoid dependencies between proposals when possible
4. Update documentation when graduating APIs

**Validation**:

1. Run `npm run vscode-dts-compile-check` before committing
2. Test with actual extensions using the proposal
3. Monitor feedback from early adopters

### For Extension Developers

**Using Stable APIs**:

- Install specific version: `@types/vscode@^1.85.0`
- Set `engines.vscode` in package.json to match
- Use stable APIs for published extensions

**Using Proposed APIs**:

- Only for development/testing
- Cannot publish to marketplace
- Expect breaking changes
- Use `npx vscode-dts dev` to download latest
- Track proposal versions if available

## Common Issues

### Proposal Not Found Error

```typescript
Error: Extension 'my-extension' wants API proposal 'myProposal' but that
proposal DOES NOT EXIST. Likely, the proposal has been finalized or abandoned.
```

**Solutions**:

1. Check if proposal was graduated to stable API
2. Verify proposal name spelling
3. Ensure `npm run watch` regenerated extensionsApiProposals.ts
4. Update to latest vscode.d.ts

### Cannot Use Proposed API

```typescript
Error: Extension 'my-extension' CANNOT USE these API proposals
```

**Solutions**:

1. Add proposals to `package.json#enabledApiProposals`
2. Run with `--enable-proposed-api=extension-id` flag
3. Run VS Code from source for development

### Type Not Found

```typescript
Cannot find name 'ChatResponseTextEditPart'
```

**Solutions**:

1. Run `npx vscode-dts dev` to download proposal types
2. Verify proposal name in `enabledApiProposals`
3. Check TypeScript configuration includes downloaded d.ts

## Additional Resources

- [VS Code Extension API Documentation](https://code.visualstudio.com/api)
- [Using Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)
- [vscode-dts Tool](https://www.npmjs.com/package/vscode-dts)
- [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/vscode)

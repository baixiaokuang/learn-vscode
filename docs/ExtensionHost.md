## Extension Loading Architecture

### Overview

VS Code uses a sophisticated multi-process extension architecture where extensions run in separate **extension hosts** (processes or web workers) isolated from the main workbench. The system is designed for:

- **Performance**: Extensions don't block the UI
- **Stability**: Extension crashes don't crash VS Code
- **Security**: Extensions run in sandboxed environments
- **Multi-platform**: Supports local processes, web workers, and remote extension hosts

### Core Components

#### 1. Extension Service ([src/vs/workbench/services/extensions](src/vs/workbench/services/extensions))

The main orchestrator that manages the entire extension lifecycle.

**Key Files:**

- **[extensions.ts](src/vs/workbench/services/extensions/common/extensions.ts)** - `IExtensionService` interface and core types
- **[abstractExtensionService.ts](src/vs/workbench/services/extensions/common/abstractExtensionService.ts)** - Base implementation for all platforms
- **[extensionService.ts](src/vs/workbench/services/extensions/browser/extensionService.ts)** - Browser/web implementation
- **[nativeExtensionService.ts](src/vs/workbench/services/extensions/electron-browser/nativeExtensionService.ts)** - Electron/native implementation

**Main responsibilities:**

- Scan and discover extensions
- Determine where extensions should run (local process, web worker, or remote)
- Manage extension host lifecycle
- Handle activation events
- Track extension status and errors

#### 2. Extension Host Types

VS Code supports three types of extension hosts:

**a) Local Process Extension Host** ([LocalProcessRunningLocation](src/vs/workbench/services/extensions/common/extensionRunningLocation.ts))

- Runs in a separate Node.js process on the local machine
- Used for extensions requiring Node.js APIs
- Entry point: [extensionHostProcess.ts](src/vs/workbench/api/node/extensionHostProcess.ts)
- Communicates via IPC with the main process

**b) Local Web Worker Extension Host** ([LocalWebWorkerRunningLocation](src/vs/workbench/services/extensions/common/extensionRunningLocation.ts))

- Runs in a Web Worker in the browser
- Used for web-compatible extensions
- Entry point: [extensionHostWorker.ts](src/vs/workbench/api/worker/extensionHostWorker.ts)
- Communicates via `MessagePort`

**c) Remote Extension Host** ([RemoteRunningLocation](src/vs/workbench/services/extensions/common/extensionRunningLocation.ts))

- Runs on a remote server (SSH, WSL, containers, etc.)
- Used for remote development scenarios
- Communicates over WebSocket/socket connection

#### 3. Extension Host Manager ([extensionHostManager.ts](src/vs/workbench/services/extensions/common/extensionHostManager.ts))

Manages a single extension host instance:

```typescript
export class ExtensionHostManager
	extends Disposable
	implements IExtensionHostManager
{
	private readonly _extensionHost: IExtensionHost;
	private _rpcProtocol: RPCProtocol | null;
	private readonly _cachedActivationEvents: Map<string, Promise<void>>;

	constructor(
		extensionHost: IExtensionHost,
		initialActivationEvents: string[]
	) {
		// Start extension host
		this._proxy = this._extensionHost
			.start()
			.then((protocol) => this._createExtensionHostCustomers(protocol));
	}

	activateByEvent(activationEvent: string): Promise<void> {
		// Request extension activation via RPC
	}
}
```

**Key responsibilities:**

- Start/stop extension host process
- Create RPC protocol for communication
- Forward activation requests
- Monitor extension host health
- Handle crashes and restarts

#### 4. Extension Host Main ([extensionHostMain.ts](src/vs/workbench/api/common/extensionHostMain.ts))

The entry point that runs **inside** the extension host process:

```typescript
export class ExtensionHostMain {
	constructor(
		protocol: IMessagePassingProtocol,
		initData: IExtensionHostInitData,
		hostUtils: IHostUtils
	) {
		// Set up RPC protocol
		this._rpcProtocol = new RPCProtocol(protocol, null, uriTransformer);

		// Bootstrap services (DI container)
		const services = new ServiceCollection(...getSingletonServiceDescriptors());
		const instaService = new InstantiationService(services, true);

		// Create extension service
		this._extensionService = instaService.invokeFunction((accessor) =>
			accessor.get(IExtHostExtensionService)
		);
		this._extensionService.initialize();
	}
}
```

**Initialization flow:**

1. Receives `IExtensionHostInitData` with all extension metadata
2. Creates RPC protocol to communicate with main process
3. Bootstraps dependency injection services
4. Creates `ExtHostExtensionService` to manage extensions
5. Initializes extensions and activates eager extensions

#### 5. Extension Activation ([extHostExtensionService.ts](src/vs/workbench/api/common/extHostExtensionService.ts))

The `AbstractExtHostExtensionService` runs inside the extension host and handles activation:

```typescript
export abstract class AbstractExtHostExtensionService
	extends Disposable
	implements ExtHostExtensionServiceShape
{
	private readonly _activator: ExtensionsActivator;
	private readonly _myRegistry: ExtensionDescriptionRegistry;

	constructor() {
		// Registry of extensions this host should run
		this._myRegistry = new ExtensionDescriptionRegistry(
			this._activationEventsReader,
			filterExtensions(this._globalRegistry, myExtensionsSet)
		);

		// Activator handles the actual activation
		this._activator = new ExtensionsActivator(
			this._myRegistry,
			this._globalRegistry,
			{
				actualActivateExtension: async (extensionId, reason) => {
					return this._activateExtension(extensionDescription, reason);
				},
			}
		);
	}

	private async _activateExtension(
		extensionDescription: IExtensionDescription,
		reason: ExtensionActivationReason
	): Promise<ActivatedExtension> {
		// Load extension module
		const extensionModule = await loadCommonJSModule(
			extensionDescription.main,
			activationTimesBuilder
		);

		// Call activate() function
		return this._doActivateExtension(
			extensionDescription,
			reason,
			extensionModule,
			activationTimesBuilder
		);
	}
}
```

### Extension Loading Flow

#### Phase 1: Scanning and Discovery

**On Startup** ([abstractExtensionService.ts](src/vs/workbench/services/extensions/common/abstractExtensionService.ts)):

1. **Scan extensions** from multiple sources:

   - System/built-in extensions (bundled with VS Code)
   - User-installed extensions (`~/.vscode/extensions`)
   - Workspace extensions (`.vscode/extensions`)
   - Extensions under development (`--extensionDevelopmentPath`)

2. **Platform-specific scanning**:

   - **Web**: [webExtensionsScannerService.ts](src/vs/workbench/services/extensionManagement/browser/webExtensionsScannerService.ts)
   - **Electron**: [cachedExtensionScanner.ts](src/vs/workbench/services/extensions/electron-browser/cachedExtensionScanner.ts)
   - **Remote**: [remoteExtensionsScanner.ts](src/vs/workbench/services/remote/common/remoteExtensionsScanner.ts)

3. **Deduplication and filtering**:
   - Remove duplicate extensions (prefer user over built-in)
   - Filter disabled extensions
   - Check enablement service
   - Validate extension manifests

#### Phase 2: Extension Host Determination

**Running Location Decision** ([extensionRunningLocationTracker.ts](src/vs/workbench/services/extensions/common/extensionRunningLocationTracker.ts)):

For each extension, VS Code determines WHERE it should run:

```typescript
class ExtensionRunningLocationTracker {
	public determineRunningLocation(
		extension: IExtensionDescription
	): ExtensionRunningLocation {
		// Check extension kind from package.json
		const extensionKind =
			this._extensionManifestPropertiesService.getExtensionKind(extension);

		// Determine preferred location based on:
		// 1. Extension kind (ui, workspace, web)
		// 2. Available extension hosts
		// 3. Configuration settings
		// 4. Platform capabilities

		if (extensionKind.includes("ui") && this._hasLocalProcess) {
			return new LocalProcessRunningLocation();
		}
		if (extensionKind.includes("workspace") && this._hasRemote) {
			return new RemoteRunningLocation();
		}
		if (extensionKind.includes("web")) {
			return new LocalWebWorkerRunningLocation();
		}
	}
}
```

**Extension kind** (from `package.json`):

```json
{
	"extensionKind": ["workspace"] // or ["ui"], ["web"], or ["ui", "workspace"]
}
```

- **`ui`**: UI extensions (themes, language grammars) - run locally
- **`workspace`**: Workspace extensions (debuggers, linters) - run where workspace is
- **`web`**: Web extensions - run in web worker

#### Phase 3: Extension Host Creation

**Starting Extension Hosts** ([abstractExtensionService.ts](src/vs/workbench/services/extensions/common/abstractExtensionService.ts)):

```typescript
protected async _initialize(): Promise<void> {
	// Resolve which extensions are available
	const extensions = await this._resolveExtensions();

	// Group extensions by running location
	const extensionsByLocation = this._runningLocations.initializeRunningLocation(
		extensions
	);

	// Create extension hosts
	for (const [location, extensionIds] of extensionsByLocation) {
		const extensionHost = await this._extensionHostFactory.createExtensionHost(
			location,
			extensionIds
		);

		const manager = this._instantiationService.createInstance(
			ExtensionHostManager,
			extensionHost,
			initialActivationEvents
		);

		this._extensionHostManagers.add(manager);
	}
}
```

#### Phase 4: Extension Host Startup

**Inside Extension Host** ([extensionHostMain.ts](src/vs/workbench/api/common/extensionHostMain.ts)):

1. **Receive initialization data**:

   ```typescript
   interface IExtensionHostInitData {
      extensions: {
   	   allExtensions: IExtensionDescription[];
   	   myExtensions: ExtensionIdentifier[];
   	   activationEvents: { [event: string]: ExtensionIdentifier[] };
      };
      environment: { ... };
      workspace: { ... };
   }
   ```

2. **Bootstrap services**:

   - Create service collection with DI container
   - Register extension host services
   - Create instantiation service

3. **Create extension service**:

   - Initialize `ExtHostExtensionService`
   - Create extension activator
   - Build extension registry

4. **Ready to activate extensions**

#### Phase 5: Extension Activation

**Activation Triggers** ([extensions.ts](src/vs/workbench/services/extensions/common/extensions.ts)):

Extensions are activated by **activation events**:

```json
{
	"activationEvents": [
		"onLanguage:typescript", // When TS file is opened
		"onCommand:myext.doSomething", // When command is executed
		"onView:myViewId", // When view is shown
		"workspaceContains:**/*.ts", // When workspace has TS files
		"onStartupFinished", // After startup (lazy)
		"*" // Eager activation (discouraged)
	]
}
```

**Activation Flow**:

1. **Event occurs** (e.g., TypeScript file opened)

   ```typescript
   // In main process
   this._extensionService.activateByEvent("onLanguage:typescript");
   ```

2. **Extension service finds interested extensions**:

   ```typescript
   const extensions = this._registry.getExtensionDescriptionsForActivationEvent(
   	"onLanguage:typescript"
   );
   ```

3. **Forward to appropriate extension host**:

   ```typescript
   for (const manager of this._extensionHostManagers) {
   	if (manager.containsExtension(extensionId)) {
   		await manager.activateByEvent(activationEvent, reason);
   	}
   }
   ```

4. **Extension host activates extension** ([extHostExtensionActivator.ts](src/vs/workbench/api/common/extHostExtensionActivator.ts)):

   ```typescript
   async activateExtension(extensionId: ExtensionIdentifier): Promise<void> {
      const extension = this._registry.getExtensionDescription(extensionId);

      // Load module
      const extensionModule = await loadCommonJSModule(
   	   extension.main,  // e.g., "./out/extension.js"
   	   activationTimesBuilder
      );

      // Create API object
      const extensionAPI = this._createExtensionAPI(extension);

      // Call activate(context)
      const activateResult = await extensionModule.activate(extensionAPI);

      return new ActivatedExtension(activateResult, activationTimes);
   }
   ```

5. **Extension's `activate()` function runs**:
   ```typescript
   // In user's extension code
   export function activate(context: vscode.ExtensionContext) {
   	// Extension initialization code
   	const disposable = vscode.commands.registerCommand("...", () => {});
   	context.subscriptions.push(disposable);
   }
   ```

### Communication Architecture

#### RPC Protocol ([rpcProtocol.ts](src/vs/workbench/services/extensions/common/rpcProtocol.ts))

Extensions communicate with VS Code via **RPC (Remote Procedure Call)**:

```
┌─────────────────┐                           ┌──────────────────────┐
│  Main Process   │                           │  Extension Host      │
│                 │                           │                      │
│  MainThread     │◄────── IPC/WebSocket ────►│  ExtHost             │
│  Services       │                           │  Services            │
│                 │                           │                      │
│  - Commands     │   ProxyIdentifier/Dto     │  - Commands          │
│  - Workspace    │   JSON Serialization      │  - Workspace         │
│  - Languages    │                           │  - Languages         │
│  - Debug        │                           │  - Debug             │
└─────────────────┘                           └──────────────────────┘
```

**Main Thread Side** (in main process):

```typescript
// Defined in extHost.protocol.ts
export interface MainThreadCommandsShape {
	$registerCommand(id: string): void;
	$executeCommand<T>(id: string, args: any[]): Promise<T>;
}
```

**Extension Host Side** (in extension host):

```typescript
// Defined in extHost.protocol.ts
export interface ExtHostCommandsShape {
	$executeContributedCommand<T>(id: string, args: any[]): Promise<T>;
}

// Implementation
class ExtHostCommands implements ExtHostCommandsShape {
	registerCommand(id: string, callback: Function): Disposable {
		this._commands.set(id, callback);
		this._proxy.$registerCommand(id); // RPC call to main
		return new Disposable(() => this._commands.delete(id));
	}
}
```

**RPC Flow**:

1. Extension calls `vscode.commands.registerCommand('myCmd', handler)`
2. ExtHost sends message: `{ type: 'request', method: '$registerCommand', args: ['myCmd'] }`
3. Main thread receives and registers command
4. User invokes command in UI
5. Main thread sends: `{ type: 'request', method: '$executeContributedCommand', args: ['myCmd', []] }`
6. ExtHost executes handler and returns result
7. Main thread receives: `{ type: 'response', id: 123, result: ... }`

### Extension Point System

Extensions contribute functionality via **extension points** ([extensionsRegistry.ts](src/vs/workbench/services/extensions/common/extensionsRegistry.ts)):

**Registration**:

```typescript
// In VS Code core
const commandsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<
	ICommand[]
>({
	extensionPoint: "commands",
	jsonSchema: commandsSchema,
});

// Listen for contributions
commandsExtensionPoint.setHandler((extensions) => {
	for (const extension of extensions) {
		for (const command of extension.value) {
			CommandsRegistry.registerCommand(command.command, handler);
		}
	}
});
```

**Extension declares contribution** (in `package.json`):

```json
{
  "contributes": {
	"commands": [
	  {
		"command": "myext.hello",
		"title": "Hello World"
	  }
	],
	"languages": [...],
	"grammars": [...],
	"themes": [...]
  }
}
```

**Common extension points**:

- `commands` - Register commands
- `menus` - Add menu items
- `keybindings` - Register keyboard shortcuts
- `languages` - Define language support
- `grammars` - TextMate grammars
- `themes` - Color themes
- `viewsContainers` - Custom sidebar sections
- `views` - Custom views/panels
- `debuggers` - Debug adapters
- `taskDefinitions` - Task types

### Extension Enablement and Lifecycle

#### Enabling/Disabling Extensions

**Enablement Service** ([extensionEnablementService.ts](src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts)):

- Global disable/enable
- Workspace-specific disable/enable
- Automatically disables incompatible extensions
- UI/Workspace sync of enablement state

**Dynamic Extension Loading**:

```typescript
// In abstractExtensionService.ts
private async _handleDeltaExtensions(item: DeltaExtensionsQueueItem): Promise<void> {
	const { toAdd, toRemove } = item;

	// Remove extensions
	for (const ext of toRemove) {
		if (this.canRemoveExtension(ext)) {
			await this._stopExtension(ext);
			this._registry.remove(ext.identifier);
		}
	}

	// Add extensions
	for (const ext of toAdd) {
		this._registry.add(ext);
		if (this._shouldActivateEagerly(ext)) {
			await this.activateById(ext.identifier);
		}
	}
}
```

#### Extension Deactivation

**Deactivation** ([extHostExtensionService.ts](src/vs/workbench/api/common/extHostExtensionService.ts)):

```typescript
private async _deactivate(extensionId: ExtensionIdentifier): Promise<void> {
	const extension = this._activator.getActivatedExtension(extensionId);
	if (!extension) {
		return;
	}

	// Call deactivate() if defined
	const extensionModule = await extension.module;
	if (typeof extensionModule.deactivate === 'function') {
		await extensionModule.deactivate();
	}

	// Dispose all subscriptions
	extension.subscriptions.forEach(s => s.dispose());
}
```

### Performance Optimizations

1. **Lazy Extension Host Creation**:

   - Extension hosts are created only when needed
   - `LazyAutoStart` hosts wait for first extension activation

2. **Activation Event Caching**:

   - Track resolved activation events to avoid redundant checks
   - Cache activation promises to deduplicate concurrent activations

3. **Snapshot and Delta Updates**:

   - Initial extension list sent as snapshot
   - Subsequent changes sent as deltas (add/remove)
   - Reduces IPC overhead

4. **Extension Path Index** ([extHostExtensionService.ts](src/vs/workbench/api/common/extHostExtensionService.ts)):

   - Build ternary search tree of extension paths
   - Fast lookup of extension by file path (for error attribution)

5. **Implicit Activation Events**:
   - Automatically derive activation events from contributions
   - E.g., `"onCommand:X"` implied by contributing command `X`

### Key Interfaces and Types

```typescript
// Extension description (from package.json)
interface IExtensionDescription {
	identifier: ExtensionIdentifier;
	name: string;
	version: string;
	publisher: string;
	engines: { vscode: string };
	activationEvents?: string[];
	main?: string;
	browser?: string;
	contributes?: IExtensionContributions;
	extensionLocation: URI;
	isBuiltin: boolean;
	extensionKind?: ExtensionKind[];
}

// Extension activation reason
interface ExtensionActivationReason {
	readonly startup: boolean;
	readonly extensionId: ExtensionIdentifier;
	readonly activationEvent: string;
}

// Extension host interface
interface IExtensionHost {
	readonly pid: number | null;
	readonly runningLocation: ExtensionRunningLocation;
	readonly startup: ExtensionHostStartup;
	readonly extensions: ExtensionHostExtensions | null;

	start(): Promise<IMessagePassingProtocol>;
	dispose(): void;
}

// Extension service interface
interface IExtensionService {
	readonly extensions: readonly IExtensionDescription[];

	activateByEvent(activationEvent: string): Promise<void>;
	activateById(
		extensionId: ExtensionIdentifier,
		reason: ExtensionActivationReason
	): Promise<void>;

	whenInstalledExtensionsRegistered(): Promise<boolean>;
	getExtension(id: string): Promise<IExtensionDescription | undefined>;
}
```

### Extension Development Flow

1. **Extension project** with `package.json`:

   ```json
   {
    "name": "my-extension",
    "main": "./out/extension.js",
    "activationEvents": ["onLanguage:python"],
    "contributes": {
      "commands": [...]
    },
    "engines": { "vscode": "^1.80.0" }
   }
   ```

2. **Extension entry point** (`src/extension.ts`):

   ```typescript
   import * as vscode from "vscode";

   export function activate(context: vscode.ExtensionContext) {
   	// Called when extension is activated
   	const disposable = vscode.commands.registerCommand("...", () => {});
   	context.subscriptions.push(disposable);
   }

   export function deactivate() {
   	// Called when extension is deactivated
   }
   ```

3. **Development workflow**:
   - Press F5 in VS Code
   - Launches Extension Development Host (new VS Code window)
   - Extension loaded with `--extensionDevelopmentPath`
   - Extension host attaches debugger
   - Breakpoints work in extension code

### Error Handling and Recovery

1. **Extension Errors** ([extensionHostMain.ts](src/vs/workbench/api/common/extensionHostMain.ts)):

   - Errors caught and attributed to extensions via stack trace analysis
   - Reported to telemetry with extension ID
   - Extension marked as failed

2. **Extension Host Crashes**:

   - Crash detected via exit event
   - Attempt restart (with exponential backoff)
   - Show notification to user
   - Track crash count (stop after threshold)

3. **Activation Timeouts**:
   - 10-second timeout for activation
   - Extension marked as slow/unresponsive
   - User notified

### Testing Extensions

**Extension Test Runner** ([extHostExtensionService.ts](src/vs/workbench/api/common/extHostExtensionService.ts)):

```typescript
async $startExtensionHost(enabledExtensionIds: ExtensionIdentifier[]): Promise<void> {
	if (this._initData.environment.extensionTestsLocationURI) {
		// Load test runner
		const testRunner = await this._loadTestRunner();

		// Run tests
		await testRunner.run();
	}
}
```

**Test structure**:

```typescript
// src/test/suite/index.ts
export function run(): Promise<void> {
	const mocha = new Mocha({ ui: "tdd" });
	return new Promise((resolve, reject) => {
		glob("**/**.test.js", { cwd: testsRoot }, (err, files) => {
			files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));
			mocha.run((failures) => (failures > 0 ? reject() : resolve()));
		});
	});
}
```

### Best Practices for Extension Authors

1. **Minimize activation events** - Don't use `*` (eager activation)
2. **Use `onStartupFinished`** - For non-critical initialization
3. **Declare `extensionKind`** - Help VS Code place your extension correctly
4. **Handle deactivation** - Clean up resources in `deactivate()`
5. **Use proposed APIs carefully** - Check `isProposedApiEnabled()`
6. **Contribute via package.json** - Use declarative contributions when possible
7. **Test in all environments** - Local, remote, and web if applicable

## Inter-Process Communication (IPC) Architecture

### Overview

VS Code uses a sophisticated multi-process architecture where different components run in separate processes and communicate via Inter-Process Communication (IPC). The IPC system is built on a layered abstraction that works across multiple transport mechanisms including Electron IPC, MessagePorts, network sockets, and child processes.

The core IPC infrastructure provides:

- **Transport-agnostic messaging**: Abstract protocols that work over any bidirectional communication channel
- **Channel-based service routing**: Services exposed as named channels with method calls and event subscriptions
- **Type-safe RPC**: Remote procedure call system with cancellation token support
- **Reliability features**: Message acknowledgment, reconnection, timeout handling
- **Performance optimizations**: Buffer pooling, message batching, efficient serialization

### Process Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Main Process (Electron)                        │
│  - Application lifecycle                                                 │
│  - Window management                                                     │
│  - Native OS integration                                                 │
│  - IPC coordination                                                      │
└──────────┬────────────┬────────────┬───────────────┬─────────────────────┘
		   │            │            │               │
		   │ Electron   │ Utility    │ MessagePort   │ MessagePort
		   │ IPC        │ Process    │               │
		   │            │            │               │
┌──────────▼──────────┐ │            │               │
│  Renderer Process   │ │            │               │
│  (Workbench Window) │ │            │               │
│  - UI rendering     │ │            │               │
│  - User interaction │ │            │               │
│  - Workbench logic  │ │            │               │
└──────────┬──────────┘ │            │               │
		   │            │            │               │
		   │ RPC        │            │               │
		   │ Protocol   │            │               │
		   │            │            │               │
┌──────────▼────────────▼────────────▼───────────────▼─────────────────────┐
│                      Extension Host Processes                             │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐            │
│  │ Local Process   │  │ Web Worker   │  │ Remote Process  │            │
│  │ (Node.js)       │  │ (Browser)    │  │ (SSH/WSL/etc)   │            │
│  └─────────────────┘  └──────────────┘  └─────────────────┘            │
└───────────────────────────────────────────────────────────────────────────┘
		   │                                         │
┌──────────▼─────────────────────────────────────────▼─────────────────────┐
│                     Shared Process (Utility)                              │
│  - Background services                                                    │
│  - Extension management                                                   │
│  - Storage/database                                                       │
└───────────────────────────────────────────────────────────────────────────┘
```

### Core IPC Components

#### 1. Message Passing Protocol ([src/vs/base/parts/ipc/common/ipc.ts](src/vs/base/parts/ipc/common/ipc.ts))

The foundation of all IPC is the `IMessagePassingProtocol` interface:

```typescript
export interface IMessagePassingProtocol {
	send(buffer: VSBuffer): void;
	onMessage: Event<VSBuffer>;
	drain?(): Promise<void>; // Wait for write buffer to become empty
}
```

This simple abstraction allows VS Code to implement IPC over various transports.

#### 2. Channel System

The channel system provides service-oriented communication:

**IChannel** (client-side interface):

```typescript
export interface IChannel {
	call<T>(
		command: string,
		arg?: any,
		cancellationToken?: CancellationToken
	): Promise<T>;
	listen<T>(event: string, arg?: any): Event<T>;
}
```

**IServerChannel** (server-side interface):

```typescript
export interface IServerChannel<TContext = string> {
	call<T>(
		ctx: TContext,
		command: string,
		arg?: any,
		cancellationToken?: CancellationToken
	): Promise<T>;
	listen<T>(ctx: TContext, event: string, arg?: any): Event<T>;
}
```

**Key characteristics**:

- Commands are method calls that return promises
- Events are observable streams
- Context parameter allows multi-client scenarios
- Cancellation tokens propagate across process boundaries

#### 3. Channel Server and Client

**ChannelServer**:

- Hosts multiple named channels
- Deserializes incoming requests
- Routes to appropriate channel
- Handles cancellation and errors
- Supports pending requests for channels not yet registered (with timeout)

**ChannelClient**:

- Accesses remote channels by name
- Serializes requests and arguments
- Manages pending responses
- Waits for protocol initialization
- Handles cancellation propagation

**Request/Response Flow**:

```
Client Side                           Server Side
──────────                            ───────────

1. call('method', args, token)
   ↓
2. Serialize: RequestType.Promise
   { id, channelName, name, arg }
   ↓
3. Send buffer ──────────────────────→ 4. Deserialize request
										   ↓
									   5. Look up channel
										   ↓
									   6. channel.call(ctx, method, args, token)
										   ↓
7. Deserialize response  ←────────────  8. Serialize: ResponseType.PromiseSuccess
   ↓                                       { id, data }
8. Resolve promise
```

#### 4. Message Serialization

VS Code uses a custom binary protocol for efficient serialization:

**Supported data types**:

- `undefined` - Special sentinel value
- `string` - UTF-8 encoded with VQL length prefix
- `Buffer`/`VSBuffer` - Binary data with length prefix
- `Array` - Recursive serialization
- `number` (integers) - Variable-length quantity encoding
- `Object` - JSON stringified

**Variable-Length Quantity (VQL)** encoding:

- Efficient encoding for integers
- Uses continuation bit (0x80) to signal more bytes
- Saves space for small numbers (common case)

### Transport Implementations

#### 1. Electron IPC Transport

**Protocol** ([src/vs/base/parts/ipc/common/ipc.electron.ts](src/vs/base/parts/ipc/common/ipc.electron.ts)):

```typescript
export class Protocol implements IMessagePassingProtocol {
	constructor(private sender: Sender, readonly onMessage: Event<VSBuffer>) {}

	send(message: VSBuffer): void {
		this.sender.send("vscode:message", message.buffer);
	}

	disconnect(): void {
		this.sender.send("vscode:disconnect", null);
	}
}
```

**Client** ([src/vs/base/parts/ipc/electron-browser/ipc.electron.ts](src/vs/base/parts/ipc/electron-browser/ipc.electron.ts)):

- Wraps `ipcRenderer` from Electron
- Sends `vscode:hello` handshake on creation
- Listens for `vscode:message` events
- Channel: `vscode:message` for all communication

**Main Process Validation** ([src/vs/base/parts/ipc/electron-main/ipcMain.ts](src/vs/base/parts/ipc/electron-main/ipcMain.ts)):

- Validates sender origin (`VSCODE_AUTHORITY`)
- Ensures sender is main frame (not iframe)
- Only accepts `vscode:*` channels
- Security: Prevents malicious renderer processes

#### 2. MessagePort Transport

**Protocol** ([src/vs/base/parts/ipc/common/ipc.mp.ts](src/vs/base/parts/ipc/common/ipc.mp.ts)):

```typescript
export class Protocol implements IMessagePassingProtocol {
	readonly onMessage;

	constructor(private port: MessagePort) {
		this.onMessage = Event.fromDOMEventEmitter<VSBuffer>(
			this.port,
			"message",
			(e: MessageEvent) => VSBuffer.wrap(e.data)
		);
		port.start();
	}

	send(message: VSBuffer): void {
		this.port.postMessage(message.buffer);
	}
}
```

**Usage**:

- Used for extension host communication
- Transferred via `postMessage` with port transfer
- Enables direct renderer ↔ extension host communication
- Bypasses main process for better performance

#### 3. Socket/Network Transport

**Protocol** ([src/vs/base/parts/ipc/common/ipc.net.ts](src/vs/base/parts/ipc/common/ipc.net.ts)):

The network transport provides sophisticated features:

**Message framing**:

```
┌──────────────────────────────────┬──────────────┐
│           HEADER (13 bytes)      │     DATA     │
├──────┬──────┬──────┬─────────────┼──────────────┤
│ TYPE │  ID  │ ACK  │ DATA_LENGTH │   PAYLOAD    │
│ 1B   │ 4B   │ 4B   │     4B      │   N bytes    │
└──────┴──────┴──────┴─────────────┴──────────────┘
```

**Message types**:

- `Regular` - Standard data message
- `Control` - Control message (not acked)
- `Ack` - Acknowledgment
- `Disconnect` - Clean shutdown
- `ReplayRequest` - Request resend
- `Pause`/`Resume` - Flow control
- `KeepAlive` - Connection health

**PersistentProtocol**:

- Tracks message IDs and acknowledgments
- Buffers unacknowledged messages
- Detects timeouts (20 seconds)
- Supports reconnection with message replay
- Load-based timeout detection

**NodeSocket implementation** ([src/vs/base/parts/ipc/node/ipc.net.ts](src/vs/base/parts/ipc/node/ipc.net.ts)):

```typescript
export class NodeSocket implements ISocket {
	constructor(socket: Socket, debugLabel: string) {
		this.socket = socket;
		socket.setNoDelay(true); // Disable Nagle's algorithm
		socket.setTimeout(0); // No automatic timeout
	}

	onData(listener: (e: VSBuffer) => void): IDisposable {
		const adapter = (buff: Buffer) => listener(VSBuffer.wrap(buff));
		this.socket.on("data", adapter);
		return { dispose: () => this.socket.off("data", adapter) };
	}

	write(buffer: VSBuffer): void {
		this.socket.write(buffer.buffer);
	}
}
```

#### 4. Child Process Transport

**Client** ([src/vs/base/parts/ipc/node/ipc.cp.ts](src/vs/base/parts/ipc/node/ipc.cp.ts)):

```typescript
export class Client implements IChannelClient {
	private child: ChildProcess | null;

	private get client(): IPCClient {
		if (!this._client) {
			this.child = fork(this.modulePath, args, forkOpts);

			const onMessage = Event.fromNodeEventEmitter(
				this.child,
				"message",
				(msg) => VSBuffer.wrap(Buffer.from(msg, "base64"))
			);

			const send = (r: VSBuffer) =>
				this.child?.send(r.buffer.toString("base64"));

			this._client = new IPCClient({ send, onMessage });
		}
		return this._client;
	}
}
```

**Server**:

```typescript
export class Server<TContext extends string> extends IPCServer<TContext> {
	constructor(ctx: TContext) {
		super(
			{
				send: (r) => process.send?.(r.buffer.toString("base64")),
				onMessage: Event.fromNodeEventEmitter(process, "message", (msg) =>
					VSBuffer.wrap(Buffer.from(msg, "base64"))
				),
			},
			ctx
		);
	}
}
```

**Performance note**: Uses base64 encoding (inefficient) - VS Code prefers MessagePort/socket based approaches for production.

### RPC Protocol for Extension Hosts

The extension host uses a specialized RPC protocol ([src/vs/workbench/services/extensions/common/rpcProtocol.ts](src/vs/workbench/services/extensions/common/rpcProtocol.ts)) built on top of IPC.

#### RPCProtocol Class

**Key features**:

```typescript
export class RPCProtocol extends Disposable implements IRPCProtocol {
	private readonly _locals: any[]; // Local implementations
	private readonly _proxies: any[]; // Remote proxies
	private _lastMessageId: number;
	private readonly _pendingRPCReplies: Map;
	private readonly _cancelInvokedHandlers: Map;

	getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T> {
		// Returns ES6 Proxy that intercepts method calls
		// and converts them to RPC messages
	}

	set<T>(identifier: ProxyIdentifier<T>, value: T): T {
		// Registers local implementation
	}
}
```

**Proxy creation**:

```typescript
private _createProxy<T>(rpcId: number, debugName: string): T {
	const handler = {
		get: (target: any, name: PropertyKey) => {
			if (typeof name === 'string' && name.charCodeAt(0) === CharCode.DollarSign) {
				target[name] = (...myArgs: any[]) => {
					return this._remoteCall(rpcId, name, myArgs);
				};
			}
			return target[name];
		}
	};
	return new Proxy(Object.create(null), handler);
}
```

**Convention**: Methods starting with `$` are RPC methods (e.g., `$showMessage`).

#### Message Format

**Request messages**:

```
┌────────────┬────────┬─────────────┬────────────┬──────────────┐
│ MessageType│   ID   │   RPC ID    │   Method   │     Args     │
│   (1 byte) │(4 byte)│  (1 byte)   │  (string)  │   (mixed)    │
└────────────┴────────┴─────────────┴────────────┴──────────────┘
```

**Response messages**:

- `ReplyOKEmpty` - Success with no return value
- `ReplyOKJSON` - Success with JSON result
- `ReplyOKJSONWithBuffers` - Success with result containing buffers
- `ReplyOKVSBuffer` - Success with VSBuffer result
- `ReplyErrError` - Error occurred

**Argument serialization**:

- **Simple mode**: Pure JSON serialization (default)
- **Mixed mode**: Used when args contain:
  - `VSBuffer` instances (binary data)
  - `SerializableObjectWithBuffers` (objects with embedded buffers)
  - `undefined` values (not JSON-serializable)

#### Responsiveness Tracking

The RPC protocol tracks responsiveness:

```typescript
private static readonly UNRESPONSIVE_TIME = 3 * 1000; // 3s

private _onWillSendRequest(req: number): void {
	if (this._unacknowledgedCount === 0) {
		this._unresponsiveTime = Date.now() + RPCProtocol.UNRESPONSIVE_TIME;
	}
	this._unacknowledgedCount++;
	this._asyncCheckUresponsive.schedule();
}

private _checkUnresponsive(): void {
	if (Date.now() > this._unresponsiveTime) {
		this._setResponsiveState(ResponsiveState.Unresponsive);
	}
}
```

**Purpose**: Detect frozen extension hosts and show UI warnings to users.

### Connection Establishment Patterns

#### 1. Main Process ↔ Renderer (Electron IPC)

**Renderer side** ([src/vs/platform/ipc/electron-browser/mainProcessService.ts](src/vs/platform/ipc/electron-browser/mainProcessService.ts)):

```typescript
export class ElectronIPCMainProcessService implements IMainProcessService {
	private mainProcessConnection: IPCElectronClient;

	constructor(windowId: number) {
		this.mainProcessConnection = new IPCElectronClient(`window:${windowId}`);
	}

	getChannel(channelName: string): IChannel {
		return this.mainProcessConnection.getChannel(channelName);
	}
}
```

**Main side**: Listens on `validatedIpcMain` for incoming messages.

#### 2. Main Process ↔ Shared Process (MessagePort)

**Shared process startup**:

```typescript
private async onWindowConnection(e: IpcMainEvent, nonce: string, responseChannel: string) {
	// Wait for shared process to be ready
	await this.whenReady();

	// Get MessagePort from shared process
	const port = await this.connect(responseChannel);

	// Transfer port to requesting window
	e.sender.postMessage(responseChannel, nonce, [port]);
}
```

**Connection flow**:

1. Workbench window sends `SharedProcessChannelConnection.request` via IPC
2. Main process creates/connects to shared process
3. Main process obtains MessagePort from shared process
4. MessagePort transferred back to workbench
5. Direct MessagePort-based IPC established

#### 3. Renderer ↔ Extension Host (MessagePort)

**Connection establishment**:

```typescript
private async _start(): Promise<IMessagePassingProtocol> {
	// Create extension host process
	this._extensionHostProcess = new ExtensionHostProcess(id, this._extensionHostStarter);

	// Fork the process
	await this._extensionHostProcess.start(opts);

	// Acquire MessagePort
	const { port1, port2 } = await acquirePort(undefined, this._extensionHostProcess.onMessage);

	// Send port2 to extension host via special message
	this._extensionHostProcess.postMessage({
		type: 'VSCODE_EXTHOST_IPC_SOCKET',
		port: port2
	});

	// Create protocol over port1
	return new MessagePortProtocol(port1);
}
```

**MessagePort advantages**:

- Direct communication (no main process relay)
- Structured clone algorithm for serialization
- Transferable objects support
- Better performance than IPC relay

### ProxyChannel Pattern

For convenience, VS Code provides `ProxyChannel` utilities to automatically wrap services:

**Server side** - Automatic channel creation:

```typescript
const disposables = new DisposableStore();
const channel = ProxyChannel.fromService(myService, disposables);
server.registerChannel("myChannel", channel);
```

**Client side** - Automatic proxy creation:

```typescript
const channel = client.getChannel("myChannel");
const myService = ProxyChannel.toService<IMyService>(channel);

// Now call methods directly:
await myService.doSomething();
```

**Convention**:

- Events must be named `onUpperCase` (e.g., `onDidChange`)
- Dynamic events: `onDynamicUpperCase` (methods returning events)
- Methods are automatically proxied
- URI/RegExp are automatically marshalled if enabled

### Communication Flows

#### Simple Method Call

```
Workbench (Renderer)                  Main Process
────────────────────                  ────────────

1. service.getChannel('myChannel')
   ↓
2. channel.call('doWork', args)
   ↓
3. ChannelClient serializes:
   { type: Promise, id: 1, channelName: 'myChannel', name: 'doWork', arg }
   ↓
4. Send via ipcRenderer ───────────────→ 5. ipcMain receives
											 ↓
										 6. ChannelServer deserializes
											 ↓
										 7. Lookup channel 'myChannel'
											 ↓
										 8. channel.call(ctx, 'doWork', args, token)
											 ↓
										 9. Execute actual method
											 ↓
10. Deserialize response  ←───────────── 11. Serialize: { type: PromiseSuccess, id: 1, data }
	↓
11. Resolve promise with result
```

#### Event Subscription

```
Workbench                             Extension Host
────────                              ──────────────

1. channel.listen('onDidChange', arg)
   ↓
2. Emitter.onWillAddFirstListener
   ↓
3. Send: { type: EventListen, id: 2, channelName, name: 'onDidChange' }
   ────────────────────────────────→ 4. ChannelServer receives
										  ↓
									  5. channel.listen(ctx, 'onDidChange', arg)
										  ↓
									  6. Subscribe to actual event
										  ↓
									  7. On event fire:
										 Send: { type: EventFire, id: 2, data }
8. Fire emitter  ←────────────────────────
   ↓
9. Client receives event

...

10. Last listener removed
	↓
11. Send: { type: EventDispose, id: 2 }
	────────────────────────────────→ 12. Dispose server-side listener
```

#### Cancellation Propagation

```
Client                                Server
──────                                ──────

1. call('longOp', args, token)
   ↓
2. Listen to token.onCancellationRequested
   ↓
3. Send: { type: Promise, id: 3, ... }
   ────────────────────────────────→ 4. Create CancellationTokenSource
										  ↓
									  5. channel.call(ctx, 'longOp', args, newToken)
										  ↓
									  6. Long operation starts...

7. User cancels
   ↓
8. Send: { type: Cancel, id: 3 }
   ────────────────────────────────→ 9. Cancel server-side token
										  ↓
									  10. Operation aborts
										  ↓
11. Reject with CancellationError ←────── 12. Send: { type: PromiseErrorObj, ... }
```

### Advanced Features

#### 1. IPCServer Multi-Client Support

`IPCServer` manages multiple client connections:

```typescript
export class IPCServer<TContext>
	implements IChannelServer, IRoutingChannelClient
{
	private _connections = new Set<Connection<TContext>>();

	constructor(onDidClientConnect: Event<ClientConnectionEvent>) {
		onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
			const onFirstMessage = Event.once(protocol.onMessage);
			onFirstMessage((msg) => {
				const ctx = deserialize(msg); // Client sends context first

				const channelServer = new ChannelServer(protocol, ctx);
				const channelClient = new ChannelClient(protocol);

				const connection = { channelServer, channelClient, ctx };
				this._connections.add(connection);

				onDidClientDisconnect(() => {
					connection.channelServer.dispose();
					connection.channelClient.dispose();
					this._connections.delete(connection);
				});
			});
		});
	}

	getChannel<T>(channelName: string, router: IClientRouter): T {
		// Route to specific client based on context
	}
}
```

**Use case**: Shared process serving multiple workbench windows.

#### 2. Delayed Channels

Handle channels that aren't immediately available:

```typescript
export function getDelayedChannel<T>(promise: Promise<T>): T {
	return {
		call(command, arg, token) {
			return promise.then((c) => c.call(command, arg, token));
		},
		listen(event, arg) {
			const relay = new Relay();
			promise.then((c) => (relay.input = c.listen(event, arg)));
			return relay.event;
		},
	};
}
```

**Purpose**: Start using a channel before connection is established; calls are queued.

#### 3. Reconnection Support (PersistentProtocol)

For remote connections, the protocol supports reconnection:

```typescript
public beginAcceptReconnection(socket: ISocket, initialDataChunk: VSBuffer) {
	this._isReconnecting = true;

	// Dispose old socket
	this._socketDisposables.dispose();
	this._socket.dispose();

	// Install new socket
	this._socket = socket;
	this._socketWriter = new ProtocolWriter(socket);
	this._socketReader = new ProtocolReader(socket);
	this._socketReader.acceptChunk(initialDataChunk);
}

public endAcceptReconnection(): void {
	this._isReconnecting = false;

	// Re-ACK last received message
	this._socketWriter.write(new ProtocolMessage(
		ProtocolMessageType.Ack, 0, this._incomingAckId, emptyBuffer
	));

	// Resend all unacknowledged messages
	const toSend = this._outgoingUnackMsg.toArray();
	for (const msg of toSend) {
		this._socketWriter.write(msg);
	}
}
```

**Features**:

- Preserves message ordering
- Replays unacknowledged messages
- No message loss during reconnection
- Grace period: 3 hours

### Key Files Reference

#### Core IPC Infrastructure

- **[src/vs/base/parts/ipc/common/ipc.ts](src/vs/base/parts/ipc/common/ipc.ts)** - Base abstractions, ChannelServer/Client, serialization
- **[src/vs/base/parts/ipc/common/ipc.net.ts](src/vs/base/parts/ipc/common/ipc.net.ts)** - Socket protocol, PersistentProtocol, message framing
- **[src/vs/base/parts/ipc/common/ipc.mp.ts](src/vs/base/parts/ipc/common/ipc.mp.ts)** - MessagePort protocol
- **[src/vs/base/parts/ipc/common/ipc.electron.ts](src/vs/base/parts/ipc/common/ipc.electron.ts)** - Electron IPC protocol

#### Node.js/Electron Implementations

- **[src/vs/base/parts/ipc/node/ipc.net.ts](src/vs/base/parts/ipc/node/ipc.net.ts)** - NodeSocket, WebSocketNodeSocket
- **[src/vs/base/parts/ipc/node/ipc.cp.ts](src/vs/base/parts/ipc/node/ipc.cp.ts)** - Child process IPC
- **[src/vs/base/parts/ipc/electron-main/ipcMain.ts](src/vs/base/parts/ipc/electron-main/ipcMain.ts)** - Main process IPC validation
- **[src/vs/base/parts/ipc/electron-browser/ipc.electron.ts](src/vs/base/parts/ipc/electron-browser/ipc.electron.ts)** - Renderer IPC client

#### Extension Host RPC

- **[src/vs/workbench/services/extensions/common/rpcProtocol.ts](src/vs/workbench/services/extensions/common/rpcProtocol.ts)** - RPC protocol implementation
- **[src/vs/workbench/services/extensions/common/proxyIdentifier.ts](src/vs/workbench/services/extensions/common/proxyIdentifier.ts)** - Proxy identifiers
- **[src/vs/workbench/api/common/extHost.protocol.ts](src/vs/workbench/api/common/extHost.protocol.ts)** - Extension API protocol definitions

#### Service Integration

- **[src/vs/platform/ipc/electron-browser/mainProcessService.ts](src/vs/platform/ipc/electron-browser/mainProcessService.ts)** - Main process service access
- **[src/vs/platform/sharedProcess/electron-main/sharedProcess.ts](src/vs/platform/sharedProcess/electron-main/sharedProcess.ts)** - Shared process management
- **[src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts](src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts)** - Local extension host startup

### Best Practices

#### 1. Service Design

**Use channels for all cross-process communication**:

```typescript
// Good: Channel-based service
class MyServiceChannel implements IServerChannel {
	constructor(private service: IMyService) {}

	call(ctx: any, command: string, arg: any): Promise<any> {
		switch (command) {
			case "getData":
				return this.service.getData(arg);
			case "setData":
				return this.service.setData(arg);
		}
	}

	listen(ctx: any, event: string): Event<any> {
		switch (event) {
			case "onDataChanged":
				return this.service.onDataChanged;
		}
	}
}

// Better: Use ProxyChannel
const channel = ProxyChannel.fromService(myService, disposables);
```

#### 2. Error Handling

**Always handle serialization errors**:

```typescript
// Errors are automatically serialized with stack traces
channel.call("riskyOperation").catch((err) => {
	if (errors.isCancellationError(err)) {
		// User cancelled
	} else {
		// Real error - has .name, .message, .stack
		logService.error(err);
	}
});
```

#### 3. Cancellation

**Always propagate cancellation tokens**:

```typescript
// Extension API
export function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand("myCmd", async (token: CancellationToken) => {
		// Token automatically propagates through RPC
		await vscode.window.showInputBox({}, token);
	});
}
```

#### 4. Performance

**Use binary data for large payloads**:

```typescript
// Avoid: JSON serialization of large data
channel.call("processData", largeObject); // Inefficient

// Prefer: VSBuffer for binary data
const buffer = VSBuffer.fromString(JSON.stringify(largeObject));
channel.call("processData", buffer); // Efficient
```

**Batch operations**:

```typescript
// Avoid: Many small RPC calls
for (const item of items) {
	await channel.call("processItem", item); // N round trips
}

// Prefer: Single batch call
await channel.call("processBatch", items); // 1 round trip
```

#### 5. Resource Management

**Always dispose connections**:

```typescript
const client = new IPCClient(protocol, "myContext");
try {
	const channel = client.getChannel("myChannel");
	await channel.call("doWork");
} finally {
	client.dispose(); // Clean up
}
```

### Security Considerations

1. **Validate IPC origins**:

   - Only accept `vscode:*` channels
   - Verify sender is from `VSCODE_AUTHORITY` origin
   - Ensure sender is main frame (not iframe)

2. **Sanitize inputs**:

   - All channel arguments should be validated
   - Use schema validation for complex inputs
   - Don't trust data from any process

3. **Limit channel exposure**:

   - Only register necessary channels
   - Use context-based access control
   - Implement authentication where needed

4. **Handle DoS scenarios**:
   - Rate limit requests
   - Enforce timeouts
   - Monitor memory usage

### Performance Characteristics

**Latency**:

- Electron IPC: ~0.5-2ms per call (same machine)
- MessagePort: ~0.3-1ms (direct channel)
- Socket (local): ~0.1-0.5ms (no serialization overhead)
- Socket (remote): Network dependent + protocol overhead

**Throughput**:

- Limited by serialization speed
- VSBuffer used to avoid copies
- Binary protocol minimizes overhead
- Batching recommended for bulk operations

**Memory**:

- Each channel client allocates ~1KB
- Pending requests kept until acknowledged
- Buffers pooled when possible
- Use `drain()` to wait for flush

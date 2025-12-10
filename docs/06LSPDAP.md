## 7. Language Services: LSP and DAP

VS Code decoupled language support from the editor using the **Language Server Protocol (LSP)** and **Debug Adapter Protocol (DAP)**. This architectural decision transformed the industry, allowing language creators (Rust, Go, Python) to build one server that works in VS Code, Vim, Emacs, and Sublime Text.

### 7.1 LSP Architecture

- **The Server:** A standalone process running the language analysis tools. It builds the AST (Abstract Syntax Tree) and maintains the project symbol index.

- **The Client:** The VS Code extension acts as the client. It translates the generic editor events into LSP messages.

- **JSON-RPC:** The communication is stateless JSON-RPC over `stdin/stdout` or sockets.25

### 7.2 Incremental Synchronization

For performance, LSP supports `textDocument/didChange` with incremental updates.

- Instead of sending the full 1MB file content on every keystroke, the client sends a "Content Change Event": `{ range: { start: { line: 10, character: 5 }, end:... }, text: "a" }`.

- The Server must apply this patch to its internal representation of the file. This requires the Server to implement a text buffer logic similar to the client's (often using Piece Tables or Ropes) to ensure its view of the code is identical to the editor's.26

### 7.3 Middleware and Embedded Languages

A sophisticated feature of the VS Code Language Client is **Middleware**.26

- **Scenario:** HTML files containing `<script>` tags. The HTML Language Server doesn't know JavaScript.

- **Middleware Logic:** The HTML extension can intercept the `provideCompletionItem` request.

  1. It checks if the cursor is inside a `<script>` tag.

  2. If so, it projects that region into a "Virtual Document" (a temporary JS file).

  3. It forwards the request to the TypeScript Language Server.

  4. The TS Server returns JS completions.

  5. The HTML extension maps the positions back to the HTML file and returns the result.

- This allows for "Polyglot" files where multiple language servers contribute features to a single document without knowing about each other.

### 7.4 Language Client in the Repository

- The `LanguageClient` implementation that ships with built-in extensions lives in `extensions/html-language-features/node_modules/vscode-languageclient/lib/common/client.js` (also pulled into JSON/CSS/Markdown). `start()` walks a state machine (Initial → Starting → Running) and wires protocol notifications (`ShowMessage`, telemetry) before issuing the `initialize` request.
- `createConnection()` wraps `createProtocolConnection` from `vscode-languageserver-protocol`, and the `DefaultErrorHandler` throttles restart loops (max crashes per 3 minutes) while surfacing errors to the output channel.
- Every outbound `sendRequest`/`sendNotification` forces the client to start, flushes pending `didOpen` events, and drains any full-sync text changes before talking to the server. This keeps the server’s view consistent even when opens are delayed or full-content sync is in use.
- Middleware hooks in `clientOptions.middleware` wrap `sendRequest`, `sendNotification`, and progress plumbing, giving extensions the same interception surface described in §7.3 but enforced in code.

### 7.5 Text Synchronization Pipeline

- `DidOpenTextDocumentFeature`/`DidChangeTextDocumentFeature`/`DidCloseTextDocumentFeature` in `extensions/html-language-features/node_modules/vscode-languageclient/lib/common/textSynchronization.js` register VS Code workspace listeners and translate them into protocol notifications.
- `DidOpen` supports `textSynchronization.delayOpenNotifications`: it parks opens for invisible tabs and only sends them when the tab becomes visible (tracked via `tabsModel`), preventing servers from loading unused files.
- When a server asks for `TextDocumentSyncKind.Full`, `sendPendingFullTextDocumentChanges()` (client.js:1284) drains buffered documents under a semaphore so full-sync payloads never overlap and never race with in-flight opens.
- These pending flushes are invoked ahead of every outgoing LSP request/notification, guaranteeing the server sees the exact buffer the user sees, even with debounced or delayed events.

### 7.6 Extension Host Adapters

- LSP extensions register VS Code language providers, which the Extension Host marshals through adapters in `src/vs/workbench/api/common/extHostLanguageFeatures.ts`.
- Examples: `DocumentSymbolAdapter` converts flat `SymbolInformation[]` into a hierarchical tree before handing it to the renderer, and `CodeLensAdapter` caches lenses plus their command disposables so resolve requests can be replayed. All adapters convert between `vscode` API objects and IPC-friendly DTOs for the main thread.
- The `vscode-languageclient` library plugs into this by calling `languages.register*` during feature setup; server responses are converted by these adapters before the editor renders them.

### 7.7 Debugger Contributions and Factories

- `AdapterManager` in `src/vs/workbench/contrib/debug/browser/debugAdapterManager.ts` ingests the `debuggers` and `breakpoints` extension points, merges wildcard contributions, and updates the live `launch.json` JSON schema (`updateDebugAdapterSchema`).
- `registerDebugAdapterFactory` binds debug types to factories that can create adapters (server/pipe/executable/inline), while context keys like `debuggersAvailable` toggle UI affordances. This is the first stop when an extension calls `vscode.debug.registerDebugAdapterDescriptorFactory`.

### 7.8 DAP Transport Layer

- The core adapter contract is in `src/vs/workbench/contrib/debug/common/abstractDebugAdapter.ts`: it sequences DAP messages, injects task boundaries between messages to avoid microtask reordering bugs, tracks pending requests, and times them out with synthetic `canceled` responses.
- Transports in `src/vs/workbench/contrib/debug/node/debugAdapter.ts` cover stdio (`ExecutableDebugAdapter`), sockets (`SocketDebugAdapter`), named pipes/UNIX sockets (`NamedPipeDebugAdapter`), and a generic `StreamDebugAdapter` that frames messages with `Content-Length` headers. Shutdown paths call `cancelPendingRequests()` to resolve outstanding promises before tearing down connections.

### 7.9 Session Runtime

- `RawDebugSession` (`src/vs/workbench/contrib/debug/browser/rawDebugSession.ts`) owns a single adapter instance, sets `readyForBreakpoints` after the `initialized` event, and merges capability updates from `capabilities` events.
- It fans out DAP events to UI models (`_onDidStop`, `_onDidContinued`, progress/output streams), tracks telemetry flags such as whether a `stopped` event was observed, and guards shutdown so `onDidExitAdapter` fires only once.
- Extension-host debugging hooks (`IExtensionHostDebugService`) let the session trigger `runInTerminal` requests or reload prompts when the debuggee is another VS Code extension host, keeping the DAP plumbing consistent across local and extension-debug scenarios.

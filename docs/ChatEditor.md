# Chat Editor Architecture

## Overview

The Chat feature in VS Code is implemented as a workbench contribution located in `src/vs/workbench/contrib/chat/`. The architecture follows VS Code's contribution model with three main components: the `ChatEditor`, `ChatEditorInput`, and the underlying `ChatWidget`.

## Component Hierarchy

```txt
ChatEditor (EditorPane)
  └─ ChatWidget (main UI component)
      ├─ ChatInputPart (input field with attachments)
      ├─ ChatListRenderer (renders conversation items)
      ├─ ChatViewWelcomePart (welcome screen)
      └─ WorkbenchObjectTree (list of chat items)
```

## Key Files

- **[src/vs/workbench/contrib/chat/browser/chatEditor.ts](/src/vs/workbench/contrib/chat/browser/chatEditor.ts)** - EditorPane implementation
- **[src/vs/workbench/contrib/chat/browser/chatEditorInput.ts](/src/vs/workbench/contrib/chat/browser/chatEditorInput.ts)** - Editor input model
- **[src/vs/workbench/contrib/chat/browser/chatWidget.ts](/src/vs/workbench/contrib/chat/browser/chatWidget.ts)** - Main chat UI widget
- **[src/vs/workbench/contrib/chat/browser/chat.contribution.ts](/src/vs/workbench/contrib/chat/browser/chat.contribution.ts)** - Registration and configuration
- **[src/vs/workbench/contrib/chat/electron-browser/chat.contribution.ts](/src/vs/workbench/contrib/chat/electron-browser/chat.contribution.ts)** - Electron-specific features

## Minimal Implementation

A bare-bones `ChatEditor` is useful for smoke testing or teaching the chat pipeline without pulling in agents, tools, or persistence. The minimal build focuses on wiring an input box to a transcript list and echoing the user prompt back.

### **Goals**

- Reuse the existing `ChatWidget` so the user can type into the Monaco-powered input and see messages render in the list.
- Persist conversation state in-memory via `IChatService.startSession`.
- Register a single agent implementation that returns a canned response, proving the round-trip from input to output.

### **Implementation Steps**

- **Bootstrap the editor input**: Implement `ChatEditorInput.resolve()` so it calls `this.chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None, undefined, inputType)` (see `chatEditorInput.ts:182`). Store and return the resulting `ChatModel`; this gives you a transcript container without relying on serialized history.
- **Render the widget**: In `ChatEditor.createEditor()`, create the scoped services and call `scopedInstantiationService.createInstance(ChatWidget, ...)` exactly as the production editor does. When `setInput()` is invoked, call `this.widget.setModel(editorModel, viewState)` so the widget binds to the in-memory chat model.
- **Add a trivial agent**: Use `IChatAgentService.registerAgent()` to expose metadata (id, name, default flag) and `registerAgentImplementation()` to supply a handler that echoes the prompt. Inside `invoke()` (import `MarkdownString` from `vs/base/common/htmlContent`) call `progress([{ kind: 'markdownContent', content: new MarkdownString(\`You said: ${request.message}\`) }])`and return`{}`; the widget renders the markdown as the agent response.
- **Wire a command to open the editor**: Register a command that calls `editorService.openEditor({ resource: URI.parse('vscode-chat-editor://minimal'), options: { pinned: true } });` so you can launch the test editor without the full resolver stack.
- **Keep state ephemeral**: Skip memento storage and advanced context keys; the widget will still remember the input box value and scroll position during the session.

```ts
// Minimal chat bootstrap (pseudo-code)
const session = chatService.startSession(
  ChatAgentLocation.Chat,
  CancellationToken.None
);
const viewState = { focusInput: true };
chatWidget.setModel(session, viewState);

chatAgentService.registerAgent("minimal", {
  id: "minimal",
  name: "Minimal Agent",
  isDefault: true,
  displayName: "Minimal Agent",
});

chatAgentService.registerAgentImplementation("minimal", {
  async invoke(request, progress, history, token) {
    progress([
      {
        kind: "markdownContent",
        content: new MarkdownString(`You said: ${request.message}`),
      },
    ]);
    return {};
  },
});
```

## Registration Flow

1. [**Editor Pane Registration**](/src/vs/workbench/contrib/chat/browser/chat.contribution.ts#L723)

   ```typescript
   Registry.as<IEditorPaneRegistry>(
     EditorExtensions.EditorPane
   ).registerEditorPane(
     EditorPaneDescriptor.create(
       ChatEditor,
       ChatEditorInput.EditorID,
       nls.localize("chat", "Chat")
     ),
     [new SyncDescriptor(ChatEditorInput)]
   );
   ```

2. **Editor Resolver Registration**

   - [Registers handling](/src/vs/workbench/contrib/chat/browser/chat.contribution.ts#L763) for `vscode-chat-editor://` and `vscode-chat-session://` URIs
   - [Creates `ChatEditorInput` instances](/src/vs/workbench/contrib/chat/browser/chat.contribution.ts#L775) for chat resources
   - Ensures single editor per chat session (`singlePerResource: true`)

3. [**Serialization**](/src/vs/workbench/contrib/chat/browser/chat.contribution.ts#L924)

   ```typescript
   Registry.as<IEditorFactoryRegistry>(
     EditorExtensions.EditorFactory
   ).registerEditorSerializer(
     ChatEditorInput.TypeID,
     ChatEditorInputSerializer
   );
   ```

## ChatEditor Rendering Process

### 1. [Editor Creation](/src/vs/workbench/contrib/chat/browser/chatEditor.ts#L70)

When a chat editor is opened, `createEditor()` is called:

```typescript
protected override createEditor(parent: HTMLElement): void {
    // Create scoped context key service for this editor
    this._scopedContextKeyService = this._register(
        this.contextKeyService.createScoped(parent)
    );

    // Create scoped instantiation service
    const scopedInstantiationService = this._register(
        this.instantiationService.createChild(
            new ServiceCollection([IContextKeyService, this.scopedContextKeyService])
        )
    );

    // Set context key indicating we're in a chat editor
    ChatContextKeys.inChatEditor.bindTo(this._scopedContextKeyService).set(true);

    // Create the ChatWidget
    this._widget = this._register(
        scopedInstantiationService.createInstance(
            ChatWidget,
            ChatAgentLocation.Panel,
            undefined,
            { /* widget options */ },
            { /* styles */ }
        )
    );

    // Render the widget and make it visible
    this.widget.render(parent);
    this.widget.setVisible(true);
}
```

### 2. [Setting Input/Model](/src/vs/workbench/contrib/chat/browser/chatEditor.ts#L128)

When content is loaded via `setInput()`:

```typescript
override async setInput(
    input: ChatEditorInput,
    options: IChatEditorOptions | undefined,
    context: IEditorOpenContext,
    token: CancellationToken
): Promise<void> {
    await super.setInput(input, options, context, token);

    // Check for contributed chat sessions (e.g., coding agents)
    const chatSessionType = getChatSessionType(input);
    if (chatSessionType !== 'local') {
        const contribution = this.chatSessionsService.findContribution(chatSessionType);
        if (contribution) {
            this.widget.lockToCodingAgent(
                contribution.name,
                contribution.displayName,
                contribution.type
            );
        }
    }

    // Resolve the editor model (contains chat history)
    const editorModel = await raceCancellationError(input.resolve(), token);

    // Update the widget with the model
    this.updateModel(editorModel.model, viewState);
}
```

### 3. [ChatWidget Rendering](/src/vs/workbench/contrib/chat/browser/chatWidget.ts#L736)

The `ChatWidget.render()` method creates the complete UI:

```typescript
render(parent: HTMLElement): void {
    // Create main container
    this.container = dom.append(parent, $('.interactive-session'));

    // Create welcome message container (shown when empty)
    this.welcomeMessageContainer = dom.append(
        this.container,
        $('.chat-welcome-view-container', { style: 'display: none' })
    );

    // Create todo list widget
    dom.append(this.container, this.chatTodoListWidget.domNode);

    // Create input and list (order depends on renderInputOnTop option)
    if (renderInputOnTop) {
        this.createInput(this.container, { renderFollowups, renderStyle });
        this.listContainer = dom.append(this.container, $(`.interactive-list`));
    } else {
        this.listContainer = dom.append(this.container, $(`.interactive-list`));
        this.createInput(this.container, { renderFollowups, renderStyle });
    }

    // Render welcome content if chat is empty
    this.renderWelcomeViewContentIfNeeded();

    // Create the tree/list for chat items
    this.createList(this.listContainer, { ...options });

    // Initialize contributions (extensions)
    this.contribs = ChatWidget.CONTRIBS.map(contrib =>
        this.instantiationService.createInstance(contrib, this)
    );
}
```

### 4. [List/Tree Creation](/src/vs/workbench/contrib/chat/browser/chatWidget.ts#L1629)

The conversation is rendered using a `WorkbenchObjectTree`:

```typescript
private createList(listContainer: HTMLElement, options: IChatListItemRendererOptions): void {
    // Create delegate for item heights
    const delegate = scopedInstantiationService.createInstance(
        ChatListDelegate,
        this.viewOptions.defaultElementHeight ?? 200
    );

    // Create renderer for chat items
    this.renderer = this._register(
        scopedInstantiationService.createInstance(
            ChatListItemRenderer,
            this.editorOptions,
            options,
            rendererDelegate,
            this._codeBlockModelCollection,
            overflowWidgetsContainer,
            this.viewModel,
        )
    );

    // Create the tree
    this.tree = this._register(
        scopedInstantiationService.createInstance(
            WorkbenchObjectTree<ChatTreeItem, FuzzyScore>,
            'Chat',
            listContainer,
            delegate,
            [this.renderer],
            { /* tree options */ }
        )
    );
}
```

### 5. [Model Updates](/src/vs/workbench/contrib/chat/browser/chatWidget.ts#L2158)

When `setModel()` is called with a chat model:

```typescript
setModel(model: IChatModel, viewState: IChatViewState): void {
    // Create view model wrapper
    this.viewModel = this.instantiationService.createInstance(
        ChatViewModel,
        model,
        this._codeBlockModelCollection
    );

    // Update placeholder if locked to coding agent
    if (this._lockedToCodingAgent) {
        const placeholder = localize(
            'chat.input.placeholder.lockedToAgent',
            "Chat with {0}",
            this._lockedToCodingAgent
        );
        this.inputEditor.updateOptions({ placeholder });
    }

    // Listen for model changes
    this.viewModelDisposables.add(
        Event.runAndSubscribe(
            Event.accumulate(this.viewModel.onDidChange, delay),
            (events) => {
                this.requestInProgress.set(this.viewModel.requestInProgress);
                this.onDidChangeItems();
                // Scroll to end on new requests
                if (events?.some(e => e?.kind === 'addRequest') && this.visible) {
                    this.scrollToEnd();
                }
            }
        )
    );
}
```

## [Electron-Specific Features](/src/vs/workbench/contrib/chat/electron-browser/chat.contribution.ts)

The Electron version adds several platform-specific contributions:

1. **Native Builtin Tools** (lines 38-51)

   - Registers `FetchWebPageTool` for web scraping capabilities
   - Only available in native Electron context

2. **Command Line Handler** (lines 53-113)

   - Listens for `vscode:handleChatRequest` IPC messages
   - Handles `--chat` command line arguments
   - Opens chat view and submits queries from CLI

3. **Suspend Throttling Handler** (lines 115-134)

   - Prevents background throttling during active chat requests
   - Ensures chat continues when window loses focus

4. **Lifecycle Handler** (lines 136-201)

   - Vetoes window close/reload during active chat requests
   - Shows confirmation dialog to user

5. **Voice Chat Actions** (lines 203-216)
   - Registers voice input actions for desktop
   - Includes start/stop listening, text-to-speech actions

## [Service Architecture](/src/vs/workbench/contrib/chat/browser/chat.contribution.ts#L978)

Chat functionality is split across multiple services registered as singletons:

- `IChatService` - Core chat session management
- `IChatWidgetService` - Widget lifecycle and focus management
- `IChatAgentService` - Chat agent/participant registry
- `IChatEditingService` - Code editing session management
- `ILanguageModelsService` - LLM provider abstraction
- `ILanguageModelToolsService` - Tool-calling infrastructure
- `IChatSlashCommandService` - Slash command registry
- `IChatVariablesService` - Variable resolution (`#file`, `#selection`)
- `IPromptsService` - Prompt file parsing and management

## [Context Keys](/src/vs/workbench/contrib/chat/browser/chatEditor.ts#L73)

Chat uses context keys for conditional UI:

- `ChatContextKeys.inChatEditor` - Inside a chat editor pane

## [View State Management](/src/vs/workbench/contrib/chat/browser/chatEditor.ts#L168)

The editor maintains state through `Memento`:

```typescript
this._memento = new Memento(
  "interactive-session-editor-" + CHAT_PROVIDER_ID,
  this.storageService
);
this._viewState =
  viewState ??
  this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
```

State includes:

- Input text value
- Input state (cursor position, attachments)
- Scroll position
- Expanded/collapsed sections

## Key Integration Points

1. **Editor System**: Integrates with VS Code's editor infrastructure via `EditorPane`
2. **URI Handling**: Custom schemes for chat resources (`vscode-chat-editor://`, `vscode-chat-session://`)
3. **Serialization**: Persists chat sessions across restarts via `ChatEditorInputSerializer`
4. **Contribution System**: Uses workbench contributions for lifecycle management
5. **IPC (Electron)**: Handles command-line chat arguments via IPC messages

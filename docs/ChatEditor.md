## Chat Editor Architecture

### Overview

The Chat feature in VS Code is implemented as a workbench contribution located in `src/vs/workbench/contrib/chat/`. The architecture follows VS Code's contribution model with three main components: the `ChatEditor`, `ChatEditorInput`, and the underlying `ChatWidget`.

### Component Hierarchy

```
ChatEditor (EditorPane)
  └─ ChatWidget (main UI component)
	  ├─ ChatInputPart (input field with attachments)
	  ├─ ChatListRenderer (renders conversation items)
	  ├─ ChatViewWelcomePart (welcome screen)
	  └─ WorkbenchObjectTree (list of chat items)
```

### Key Files

- **[src/vs/workbench/contrib/chat/browser/chatEditor.ts](src/vs/workbench/contrib/chat/browser/chatEditor.ts)** - EditorPane implementation
- **[src/vs/workbench/contrib/chat/browser/chatEditorInput.ts](src/vs/workbench/contrib/chat/browser/chatEditorInput.ts)** - Editor input model
- **[src/vs/workbench/contrib/chat/browser/chatWidget.ts](src/vs/workbench/contrib/chat/browser/chatWidget.ts)** - Main chat UI widget
- **[src/vs/workbench/contrib/chat/browser/chat.contribution.ts](src/vs/workbench/contrib/chat/browser/chat.contribution.ts)** - Registration and configuration
- **[src/vs/workbench/contrib/chat/electron-browser/chat.contribution.ts](src/vs/workbench/contrib/chat/electron-browser/chat.contribution.ts)** - Electron-specific features

### Registration Flow

1. **Editor Pane Registration** (chat.contribution.ts:672-681)

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

2. **Editor Resolver Registration** (chat.contribution.ts:702-730)

   - Registers handling for `vscode-chat-editor://` and `vscode-chat-session://` URIs
   - Creates `ChatEditorInput` instances for chat resources
   - Ensures single editor per chat session (`singlePerResource: true`)

3. **Serialization** (chat.contribution.ts:873)
   ```typescript
   Registry.as<IEditorFactoryRegistry>(
   	EditorExtensions.EditorFactory
   ).registerEditorSerializer(
   	ChatEditorInput.TypeID,
   	ChatEditorInputSerializer
   );
   ```

### ChatEditor Rendering Process

#### 1. Editor Creation (chatEditor.ts:70-105)

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

#### 2. Setting Input/Model (chatEditor.ts:128-165)

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

#### 3. ChatWidget Rendering (chatWidget.ts:683-791)

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

#### 4. List/Tree Creation (chatWidget.ts:1425-1544)

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

#### 5. Model Updates (chatWidget.ts:1942-2000)

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

### Electron-Specific Features (electron-browser/chat.contribution.ts)

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

### Service Architecture

Chat functionality is split across multiple services registered as singletons (chat.contribution.ts:924-950):

- `IChatService` - Core chat session management
- `IChatWidgetService` - Widget lifecycle and focus management
- `IChatAgentService` - Chat agent/participant registry
- `IChatEditingService` - Code editing session management
- `ILanguageModelsService` - LLM provider abstraction
- `ILanguageModelToolsService` - Tool-calling infrastructure
- `IChatSlashCommandService` - Slash command registry
- `IChatVariablesService` - Variable resolution (`#file`, `#selection`)
- `IPromptsService` - Prompt file parsing and management

### Context Keys

Chat uses context keys for conditional UI (chatEditor.ts:73):

- `ChatContextKeys.inChatEditor` - Inside a chat editor pane
- `ChatContextKeys.inChatSession` - Active chat session
- `ChatContextKeys.requestInProgress` - Chat request in flight
- `ChatContextKeys.inputHasAgent` - `@agent` in input
- `ChatContextKeys.lockedToCodingAgent` - Locked to specific agent

### View State Management

The editor maintains state through `Memento` (chatEditor.ts:168-170):

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

### Key Integration Points

1. **Editor System**: Integrates with VS Code's editor infrastructure via `EditorPane`
2. **URI Handling**: Custom schemes for chat resources (`vscode-chat-editor://`, `vscode-chat-session://`)
3. **Serialization**: Persists chat sessions across restarts via `ChatEditorInputSerializer`
4. **Contribution System**: Uses workbench contributions for lifecycle management
5. **IPC (Electron)**: Handles command-line chat arguments via IPC messages

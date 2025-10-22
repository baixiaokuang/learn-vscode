## Cancellation Token Architecture

### Overview

VS Code uses a comprehensive cancellation token system to manage async operations and provide graceful cancellation. The system is located in [src/vs/base/common/cancellation.ts](src/vs/base/common/cancellation.ts) and provides a pattern for cancelling long-running operations.

### Core Components

#### CancellationToken Interface

The `CancellationToken` interface provides two key members:

```typescript
export interface CancellationToken {
	// Flag indicating if cancellation has been requested
	readonly isCancellationRequested: boolean;

	// Event that fires once when cancellation is requested
	readonly onCancellationRequested: (
		listener: (e: any) => any,
		thisArgs?: any,
		disposables?: IDisposable[]
	) => IDisposable;
}
```

**Key characteristics:**

- The `onCancellationRequested` event fires **only once** (cancellation can only happen once)
- Listeners registered after cancellation are called in the next event loop run
- Tokens are immutable from the consumer's perspective

#### Built-in Token Instances

```typescript
// Token that will never be cancelled
CancellationToken.None = {
	isCancellationRequested: false,
	onCancellationRequested: Event.None,
};

// Token that is already cancelled
CancellationToken.Cancelled = {
	isCancellationRequested: true,
	onCancellationRequested: shortcutEvent, // Fires immediately in next tick
};
```

### CancellationTokenSource

The `CancellationTokenSource` class creates and controls cancellation tokens:

```typescript
const source = new CancellationTokenSource();
const token = source.token;  // Lazy-initialized

// Request cancellation
source.cancel();

// Dispose (optionally cancelling)
source.dispose(cancel: boolean = false);
```

**Implementation details:**

- Tokens are **lazily created** only when accessed via `source.token`
- If `cancel()` is called before token access, returns `CancellationToken.Cancelled`
- Supports **parent tokens** for hierarchical cancellation:
  ```typescript
  const parent = new CancellationTokenSource();
  const child = new CancellationTokenSource(parent.token);
  parent.cancel(); // Also cancels child
  ```

#### Internal MutableToken

The actual token implementation uses a private `MutableToken` class:

```typescript
class MutableToken implements CancellationToken {
	private _isCancelled: boolean = false;
	private _emitter: Emitter<any> | null = null;

	cancel() {
		if (!this._isCancelled) {
			this._isCancelled = true;
			if (this._emitter) {
				this._emitter.fire(undefined);
				this.dispose();
			}
		}
	}

	get onCancellationRequested(): Event<any> {
		if (this._isCancelled) {
			return shortcutEvent; // Already cancelled
		}
		if (!this._emitter) {
			this._emitter = new Emitter<any>(); // Lazy init
		}
		return this._emitter.event;
	}
}
```

**Optimization**: The emitter is only created if someone listens to the event and the token hasn't been cancelled yet.

### CancellationError

Cancellation is signaled via a special error type:

```typescript
export class CancellationError extends Error {
	constructor() {
		super(canceledName); // "Canceled"
		this.name = this.message;
	}
}

// Check if an error is a cancellation
export function isCancellationError(error: any): boolean {
	if (error instanceof CancellationError) {
		return true;
	}
	return (
		error instanceof Error &&
		error.name === canceledName &&
		error.message === canceledName
	);
}
```

**Important**: Cancellation errors are automatically filtered in `onUnexpectedError()` to prevent logging cancelled operations as errors.

### Common Patterns

#### 1. Polling for Cancellation

Check the flag periodically in long-running operations:

```typescript
async function processItems(
	items: Item[],
	token: CancellationToken
): Promise<void> {
	for (const item of items) {
		if (token.isCancellationRequested) {
			return; // Exit early
		}
		await processItem(item);
	}
}
```

**Example from chatStatus.ts:400:**

```typescript
await this.chatEntitlementService.update(token);
if (token.isCancellationRequested) {
	return;
}
```

#### 2. Event-Based Cancellation

Register a listener for the cancellation event:

```typescript
token.onCancellationRequested(() => {
	// Clean up resources
	cleanup();
});
```

#### 3. Racing with Cancellation

Use `raceCancellation` to return a default value on cancellation:

```typescript
// From async.ts:95
export function raceCancellation<T>(
	promise: Promise<T>,
	token: CancellationToken,
	defaultValue?: T
): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const ref = token.onCancellationRequested(() => {
			ref.dispose();
			resolve(defaultValue); // Return default on cancel
		});
		promise.then(resolve, reject).finally(() => ref.dispose());
	});
}
```

**Example usage in chatEditor.ts:362:**

```typescript
const editorModel = await raceCancellationError(input.resolve(), token);
```

#### 4. Racing with Cancellation Error

Use `raceCancellationError` to throw `CancellationError` on cancellation:

```typescript
// From async.ts:109
export function raceCancellationError<T>(
	promise: Promise<T>,
	token: CancellationToken
): Promise<T> {
	return new Promise((resolve, reject) => {
		const ref = token.onCancellationRequested(() => {
			ref.dispose();
			reject(new CancellationError()); // Throw on cancel
		});
		promise.then(resolve, reject).finally(() => ref.dispose());
	});
}
```

#### 5. Cancelable Promises

Wrap async operations in a cancelable promise:

```typescript
// From async.ts:34
export function createCancelablePromise<T>(
	callback: (token: CancellationToken) => Promise<T>
): CancelablePromise<T> {
	const source = new CancellationTokenSource();
	const thenable = callback(source.token);

	return {
		cancel() {
			source.cancel();
			source.dispose();
		},
		then/catch/finally: // ... promise methods
	};
}
```

**Auto-disposal**: If the promise resolves to a `Disposable` and is cancelled, the result is automatically disposed.

#### 6. Dispose-Linked Cancellation

Create a token that cancels when a `DisposableStore` is disposed:

```typescript
// From cancellation.ts:144
export function cancelOnDispose(store: DisposableStore): CancellationToken {
	const source = new CancellationTokenSource();
	store.add({
		dispose() {
			source.cancel();
		},
	});
	return source.token;
}
```

### Usage in Chat Editor

The chat editor uses cancellation tokens extensively:

1. **Loading Editor Input** (chatEditor.ts:344):

   ```typescript
   async setInput(
      input: ChatEditorInput,
      options: IChatEditorOptions | undefined,
      context: IEditorOpenContext,
      token: CancellationToken
   ): Promise<void>
   ```

   The token allows cancelling the input resolution if the user navigates away.

2. **Voice Chat** (voiceChatService.ts:149):

   ```typescript
   const session = await this.speechService.createSpeechToTextSession(
   	token,
   	"chat"
   );
   if (token.isCancellationRequested) {
   	onSessionStoppedOrCanceled(true);
   	return;
   }
   ```

3. **Model Requests**: Chat requests to language models pass cancellation tokens to allow users to stop generation mid-stream.

### Best Practices

1. **Always check cancellation** in loops and after async operations
2. **Use `raceCancellationError`** when you want errors to propagate
3. **Use `raceCancellation`** when you want a default value on cancel
4. **Dispose listeners** to prevent memory leaks (the race functions handle this)
5. **Don't log cancellation errors** - use `isCancellationError()` to filter them
6. **Support hierarchical cancellation** by passing parent tokens to child operations
7. **Lazy token creation** - only access `source.token` if needed

### Performance Considerations

- **Lazy initialization**: Both tokens and event emitters are created only when needed
- **Single-fire events**: Cancellation events fire at most once
- **Early exits**: Check `isCancellationRequested` before expensive operations
- **Automatic cleanup**: Event listeners are disposed after firing or when the promise settles

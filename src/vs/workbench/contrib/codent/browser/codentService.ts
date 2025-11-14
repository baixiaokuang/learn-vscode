/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { CodentAskParams, CodentChannelId, CodentCommand, CodentEditResult, CodentSecretKey } from '../../../../platform/codent/common/codentTypes.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { IResourceDiffEditorInput } from '../../../common/editor.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService, ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';


export interface ICodentService {
	readonly _serviceBrand: undefined;
	ask(prompt: string, cb: (chunk: string) => void): Promise<void>;
	edit(prompt: string, cb: (edit: CodentEditResult) => void): Promise<void>;
	run(): Promise<void>;
	sendRequest(apiKey: string, prompt: string): Promise<void>;
}

export const ICodentService = createDecorator<ICodentService>('ICodentService');
export class CodentService extends Disposable implements ICodentService {
	readonly _serviceBrand: undefined;
	private readonly channel: IChannel;
	private readonly editPreviewContent = new Map<string, string>();
	private listeners: {
		onText: (chunk: string) => void;
		onEdit: (edit: CodentEditResult) => void;
	} = {
			onText: () => { },
			onEdit: () => { }
		};

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();
		const provider: ITextModelContentProvider = {
			provideTextContent: (resource) => this.providePreviewContent(resource)
		};
		this._register(this.textModelService.registerTextModelContentProvider('codent-edit-before', provider));
		this._register(this.textModelService.registerTextModelContentProvider('codent-edit-after', provider));
		this.channel = this.mainProcessService.getChannel(CodentChannelId);
		this._register(this.channel.listen<string>('onText')(e => {
			console.log(e);
			this.listeners.onText(e);
		}));
		this._register(this.channel.listen<CodentEditResult>('onEdit')(async edit => {
			console.log(edit);
			this.listeners.onEdit(edit);

			const uri = URI.parse(edit.resource);
			const editor = await this.editorService.openEditor({ resource: uri });
			const codeEditor = editor?.getControl();

			if (!isCodeEditor(codeEditor)) {
				return;
			}

			const originalUri = URI.parse(edit.resource);
			const originalText = codeEditor.getModel()?.getValue()!;

			const operations: ISingleEditOperation[] = edit.edits.map(hunk => ({
				range: new Range(hunk.startLine, 1, hunk.endLine, Number.MAX_SAFE_INTEGER),
				text: hunk.replacement,
				forceMoveMarkers: true
			}));

			codeEditor.executeEdits('codent', operations);


			const modifiedText = codeEditor.getModel()?.getValue()!;
			const tempUri1 = originalUri.with({
				scheme: 'codent-edit-before',
				fragment: String(Date.now())
			});
			const tempUri2 = originalUri.with({
				scheme: 'codent-edit-after',
				fragment: String(Date.now())
			});

			this.editPreviewContent.set(tempUri1.toString(), originalText);
			this.editPreviewContent.set(tempUri2.toString(), modifiedText);

			const diffInput: IResourceDiffEditorInput = {
				original: { resource: tempUri1 },
				modified: { resource: tempUri2 }
			};

			await this.editorService.openEditor(diffInput);
		}));
	}
	async ask(prompt: string, cb: (chunk: string) => void) {
		const apiKey = await this.secretStorageService.get(CodentSecretKey);
		this.listeners.onText = cb;
		const context = this.getActiveFileContent();
		const body = context
			? `${prompt}\n\n---\n${context.uri.toString()}\n${context.value}`
			: prompt;
		this.channel.call<CodentAskParams>('ask' satisfies CodentCommand, { prompt: body, apiKey });
	}

	async edit(prompt: string, cb: (edit: CodentEditResult) => void) {
		const apiKey = await this.secretStorageService.get(CodentSecretKey);
		console.log(apiKey);
		this.listeners.onEdit = cb;
		const context = this.getActiveFileContent();
		const body = context
			? `${prompt}\n\n---\n${context.uri.toString()}\n${context.value}`
			: prompt;
		this.channel.call<CodentAskParams>('edit' satisfies CodentCommand, { prompt: body, apiKey });
	}

	async sendRequest(apiKey: string, prompt: string): Promise<void> {
		this.channel.call('sendRequest' satisfies CodentCommand, { apiKey, prompt });
	}

	async run() {
		console.log('Running CodentService');
		this.channel.call('sendMessage', 'Hello from workbench!');
	}

	private async providePreviewContent(resource: URI) {
		const key = resource.toString();
		const text = this.editPreviewContent.get(key);
		if (text === undefined) {
			throw new Error(`No preview content stored for ${resource.toString()}`);
		}
		let model = this.modelService.getModel(resource);
		if (!model) {
			model = this.modelService.createModel(text, null, resource);
		}
		this.editPreviewContent.delete(key);
		return model;
	}

	private getActiveFileContent(): { uri: URI; value: string } | undefined {
		const control = this.editorService.activeTextEditorControl;
		const codeEditor = isCodeEditor(control)
			? control
			: isDiffEditor(control)
				? control.getModifiedEditor()
				: undefined;

		const model = codeEditor?.getModel();
		if (!model) { return; }

		return { uri: model.uri, value: model.getValue() };
	}
}

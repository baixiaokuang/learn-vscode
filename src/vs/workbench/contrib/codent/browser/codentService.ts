/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { CodentAskParams, CodentChannelId, CodentCommand, CodentSecretKey } from '../../../../platform/codent/common/CodentTypes.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export interface ICodentService {
	readonly _serviceBrand: undefined;
	ask(prompt: string, cb: (chunk: string) => void): Promise<void>;
	run(): Promise<void>;
	sendRequest(apiKey: string, prompt: string): Promise<void>;
}

export const ICodentService = createDecorator<ICodentService>('ICodentService');
export class CodentService extends Disposable implements ICodentService {
	readonly _serviceBrand: undefined;
	private readonly channel: IChannel;
	private listener: (chunk: string) => void = () => { };

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();
		this.channel = this.mainProcessService.getChannel(CodentChannelId);
		this._register(this.channel.listen<string>('onText')(e => {
			console.log(e);
			this.listener(e);
		}));
	}
	async ask(prompt: string, cb: (chunk: string) => void) {
		const apiKey = await this.secretStorageService.get(CodentSecretKey);
		console.log(apiKey);
		this.listener = cb;
		const context = this.getActiveFileContent();
		const body = context
			? `${prompt}\n\n---\n${context.uri.toString()}\n${context.value}`
			: prompt;
		console.log(body);
		this.channel.call<CodentAskParams>('ask' satisfies CodentCommand, { prompt: body, apiKey });
	}

	async sendRequest(apiKey: string, prompt: string): Promise<void> {
		this.channel.call('sendRequest' satisfies CodentCommand, { apiKey, prompt });
	}

	async run() {
		console.log('Running CodentService');
		this.channel.call('sendMessage', 'Hello from workbench!');
	}

	private getActiveFileContent(): { uri: URI; value: string } | undefined {
		const control = this.editorService.activeTextEditorControl;
		console.log(control);
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

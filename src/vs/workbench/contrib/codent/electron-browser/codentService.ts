/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CodentAskParams, CodentChannelId, CodentCommand, CodentEditResult, CodentSecretKey } from '../../../../platform/codent/common/codentTypes.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';


export interface ICodentService {
	readonly _serviceBrand: undefined;
	ask(prompt: string, cb: (chunk: string) => void): Promise<void>;
	edit(prompt: string, cb: (edit: CodentEditResult) => Promise<void>): Promise<void>;
	run(): Promise<void>;
	sendRequest(apiKey: string, prompt: string): Promise<void>;
}

export const ICodentService = createDecorator<ICodentService>('ICodentService');
export class CodentService extends Disposable implements ICodentService {
	readonly _serviceBrand: undefined;
	private readonly channel: IChannel;
	private listeners: {
		onText: (chunk: string) => void;
		onEdit: (edit: CodentEditResult) => Promise<void>;
	} = {
			onText: () => { },
			onEdit: async () => { }
		};

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
	) {
		super();
		this.channel = this.mainProcessService.getChannel(CodentChannelId);
		this._register(this.channel.listen<string>('onText')(e => {
			console.log(e);
			this.listeners.onText(e);
		}));
		this._register(this.channel.listen<CodentEditResult>('onEdit')(async edit => {
			console.log(edit);
			await this.listeners.onEdit(edit);
		}));
	}
	async ask(prompt: string, cb: (chunk: string) => void) {
		const apiKey = await this.secretStorageService.get(CodentSecretKey);
		this.listeners.onText = cb;
		this.channel.call<CodentAskParams>('ask' satisfies CodentCommand, { prompt, apiKey });
	}

	async edit(prompt: string, cb: (edit: CodentEditResult) => Promise<void>) {
		const apiKey = await this.secretStorageService.get(CodentSecretKey);
		console.log(apiKey);
		this.listeners.onEdit = cb;
		this.channel.call<CodentAskParams>('edit' satisfies CodentCommand, { prompt, apiKey });
	}

	async sendRequest(apiKey: string, prompt: string): Promise<void> {
		this.channel.call('sendRequest' satisfies CodentCommand, { apiKey, prompt });
	}

	async run() {
		console.log('Running CodentService');
		this.channel.call('sendMessage', 'Hello from workbench!');
	}
}

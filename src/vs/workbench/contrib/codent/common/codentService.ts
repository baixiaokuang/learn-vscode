/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CodentAskParams, CodentChannelId, CodentCommand, CodentSecretKey } from '../../../../platform/codent/common/CodentTypes.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
// import { streamText, createGateway, ModelMessage } from 'ai';

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
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService
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
		this.channel.call<CodentAskParams>('ask' satisfies CodentCommand, { prompt, apiKey });
	}

	async sendRequest(apiKey: string, prompt: string): Promise<void> {
		this.channel.call('sendRequest' satisfies CodentCommand, { apiKey, prompt });
	}

	async run() {
		console.log('Running CodentService');
		this.channel.call('sendMessage', 'Hello from workbench!');
	}
}

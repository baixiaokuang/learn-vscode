/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
// import { streamText, createGateway, ModelMessage } from 'ai';

export interface ICodentService {
	readonly _serviceBrand: undefined;
	run(): Promise<void>;
}

export const ICodentService = createDecorator<ICodentService>('ICodentService');
export class CodentService extends Disposable implements ICodentService {
	readonly _serviceBrand: undefined;
	private readonly channel: IChannel;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();
		this.channel = this.mainProcessService.getChannel('codent-channel');
		this._register(this.channel.listen('onText')(e => { console.log(e); }));
	}

	async run() {
		console.log('Running CodentService');
		// this.channel.call('sendMessage', 'Hello from workbench!');
	}
}

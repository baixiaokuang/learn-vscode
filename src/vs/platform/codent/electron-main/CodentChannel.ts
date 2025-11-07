/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { streamText, createGateway, ModelMessage } from 'ai';

export class CodentChannel implements IServerChannel {
	private readonly emitter = new Emitter<string>;
	async call(ctx: string, command: string, arg?: any, cancellationToken?: CancellationToken): Promise<any> {
		console.log(command);
		this.emitter.fire('Hello from main!');
		const apiKey = process.env.VERCEL_KEY;
		console.log(apiKey);

		const gateway = createGateway({ apiKey });

		const prompt: ModelMessage[] = [{ role: 'user', content: 'What is React?' }];

		const { textStream } = streamText({
			model: gateway('gpt-5-nano'),
			prompt,
		});
		for await (const chunk of textStream) {
			this.emitter.fire(chunk);
		}
	}
	listen(ctx: string, event: string, arg?: any): Event<any> {
		return this.emitter.event;
	}

}

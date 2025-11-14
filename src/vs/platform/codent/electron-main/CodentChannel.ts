/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { streamText, createGateway, ModelMessage, generateObject } from 'ai';
import { CodentAskParams, CodentCommand, CodentEditResult } from '../common/codentTypes.js';
import { z } from 'zod';

const CodentDiffSchema = z.object({
	resource: z.string(),
	edits: z.array(z.object({
		startLine: z.number(),       // 1-based inclusive
		endLine: z.number(),         // 1-based inclusive
		replacement: z.string()     // literal text to insert
	}))
});

export class CodentChannel implements IServerChannel {
	private readonly emitters = {
		text: new Emitter<string>,
		edit: new Emitter<CodentEditResult>
	};
	async call(ctx: string, command: CodentCommand, arg?: any, cancellationToken?: CancellationToken): Promise<any> {
		console.log(command);
		switch (command) {
			case 'ask': {
				const { prompt, apiKey } = arg as CodentAskParams;
				const gateway = createGateway({ apiKey });

				const messages: ModelMessage[] = [{ role: 'user', content: prompt }];

				const { textStream } = streamText({
					model: gateway('gpt-5-nano'),
					prompt: messages,
				});
				for await (const chunk of textStream) {
					this.emitters.text.fire(chunk);
				}
				break;
			}
			case 'edit': {
				const { prompt, apiKey } = arg as CodentAskParams;
				const gateway = createGateway({ apiKey });

				const messages: ModelMessage[] = [
					{ role: 'system', content: 'You need to edit the given file according to user\'s prompt, return answer in a diff format object, the startLine and endLine are 1-based inclusive.' },
					{ role: 'user', content: prompt }
				];
				const { object } = await generateObject({
					model: gateway('gpt-5-nano'),
					schema: CodentDiffSchema,
					prompt: messages,
				});
				console.log(object);
				this.emitters.edit.fire(object);
				break;
			}
			case 'sendMessage': {
				break;
			}
			case 'sendRequest': {
				console.log(arg);
				break;
			}
		}
	}
	listen(ctx: string, event: string, arg?: any): Event<any> {
		if (event === 'onText') { return this.emitters.text.event; }
		else { return this.emitters.edit.event; }
	}
}

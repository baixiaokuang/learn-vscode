/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ICodentService } from '../common/codentService.js';
import { CodentAPIAction } from './codentAction.js';
import './media/codent.css';

const $ = dom.$;

export interface ICodentWidget {
	readonly domNode?: HTMLElement;
}

export class CodentWidget extends Disposable implements ICodentWidget {
	readonly domNode?: HTMLElement;
	container!: HTMLElement;
	listContainer!: HTMLElement;
	input!: HTMLElement;
	content!: HTMLElement;
	constructor(
		@ICodentService private readonly codentService: ICodentService,
		@ICommandService private readonly commadnService: ICommandService
	) {
		super();
	}

	render(parent: HTMLElement) {
		this.container = dom.append(parent, $('.codent'));
		this.listContainer = dom.append(this.container, $('div.codent-list'));
		this.createInput(this.container);
		this.createList(this.listContainer);
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean; renderStyle?: 'compact' | 'minimal' }): void {
		this.input = dom.append(container, $('input.codent-input'));
		const button = dom.append(container, $('button', {}, 'Send'));
		button.onclick = () => {
			const prompt = (this.input as HTMLInputElement).value;
			if (prompt === '') { return; }
			(this.input as HTMLInputElement).value = '';
			dom.append(this.listContainer, $('h2', {}, 'User: ' + prompt));
			const response = dom.append(this.listContainer, $('p', {}, 'AI: '));
			this.codentService.ask(prompt, (chunk: string) => response.innerText += chunk);
		};
		const setKeyButton = dom.append(container, $('button', {}, 'Set API Key'));
		setKeyButton.onclick = async () => {
			await this.commadnService.executeCommand(CodentAPIAction.ID);
		};
	}

	private createList(listContainer: HTMLElement): void {
	}
}

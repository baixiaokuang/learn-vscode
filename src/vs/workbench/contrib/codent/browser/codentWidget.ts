/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodentService } from '../common/codentService.js';
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
		@ICodentService private readonly codentService: ICodentService
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
			dom.append(this.content, $('h2', {}, 'User: ' + prompt));
			const response = dom.append(this.content, $('p', {}, 'AI: '));
			this.codentService.ask(prompt, (chunk: string) => response.innerText += chunk);
		};
	}

	private createList(listContainer: HTMLElement): void {
		for (let i = 0; i < 100; i++) {
			dom.append(listContainer, $('p', {}, `line: ${i}`));
		}
	}
}

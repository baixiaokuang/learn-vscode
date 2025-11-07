/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodentService } from '../common/codentService.js';

const $ = dom.$;

export interface ICodentWidget {
	readonly domNode?: HTMLElement;
}

export class CodentWidget extends Disposable implements ICodentWidget {
	readonly domNode?: HTMLElement;
	container!: HTMLElement;
	listContainer!: HTMLElement;
	input!: HTMLElement;
	title!: HTMLElement;
	constructor(
		@ICodentService private readonly codentService: ICodentService
	) {
		super();
	}

	render(parent: HTMLElement) {
		this.container = dom.append(parent, $('.interactive-session'));
		this.title = dom.append(this.container, $('p.title', {}, 'Hello World!'));
		this.listContainer = dom.append(this.container, $(`.interactive-list`));
		this.createInput(this.container);
		this.createList(this.listContainer);
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean; renderStyle?: 'compact' | 'minimal' }): void {
		this.input = dom.append(container, $('input.interactive-session.chat-input-container'));
		const button = dom.append(container, $('button', {}, 'Send'));
		button.onclick = () => {
			this.title.innerText = (this.input as HTMLInputElement).value;
		};
	}

	private createList(listContainer: HTMLElement): void {
		this.codentService.run();
	}
}

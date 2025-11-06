/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

const $ = dom.$;

export interface ICodentWidget {
	readonly domNode?: HTMLElement;
}

export class CodentWidget extends Disposable implements ICodentWidget {
	readonly domNode?: HTMLElement;
	container!: HTMLElement;
	listContainer!: HTMLElement;
	constructor() {
		super();
	}

	render(parent: HTMLElement) {
		this.container = dom.append(parent, $('.interactive-session'));
		dom.append(this.container, $('p', {}, 'Hello World!'));
		this.listContainer = dom.append(this.container, $(`.interactive-list`));
		this.createInput(this.container);
		this.createList(this.listContainer);
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean; renderStyle?: 'compact' | 'minimal' }): void {

	}

	private createList(listContainer: HTMLElement): void {

	}
}

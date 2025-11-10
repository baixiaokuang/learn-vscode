/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

export class CodentAction extends Action2 {
	static readonly ID = 'codent.open';

	constructor() {
		super({
			id: CodentAction.ID,
			title: localize2('codent.open', 'Open Codent'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);

		// Open the chat view in the sidebar
		await viewsService.openView('workbench.panel.chat.view.copilot');
		console.log('Hello Codent');
	}
}

export class CodentAPIAction extends Action2 {
	static readonly ID = 'codent.api';

	constructor() {
		super({
			id: CodentAPIAction.ID,
			title: localize2('codent.api', 'Set Codent Vercel AI Gateway API key'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const secretStorageService = accessor.get(ISecretStorageService);
		const result = await quickInputService.input({
			title: 'Codent Key',
			prompt: 'Input your Vercel AI Gateway key',
			password: true
		});
		if (result === undefined || result.trim() === '') {
			return;
		}
		console.log(result);
		let key = await secretStorageService.get('CodentSecretKey');
		console.log(key);
		await secretStorageService.set('CodentSecretKey', result);
		key = await secretStorageService.get('CodentSecretKey');
		console.log(key);
	}
}

registerAction2(CodentAction);
registerAction2(CodentAPIAction);


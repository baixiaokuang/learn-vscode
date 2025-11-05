/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
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

registerAction2(CodentAction);

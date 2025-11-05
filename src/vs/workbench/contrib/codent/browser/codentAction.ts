/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export class CodentAction extends Action2 {
	static readonly ID = 'codent.open';

	constructor() {
		super({
			id: CodentAction.ID,
			title: localize2('codent.open', 'Open Codent'),
			f1: true,
			// menu: {
			// 	id: CHAT_CONFIG_MENU_ID,
			// 	when: ContextKeyExpr.equals('view', ChatViewId),
			// 	order: 11,
			// 	group: '0_level'
			// },
		});
	}
	override run(accessor: ServicesAccessor, ...args: any[]): void {
		console.log('Start Codent');
	}

}

registerAction2(CodentAction);

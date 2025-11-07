/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface ICodentService {
	_serviceBrand: undefined;
	run(): void;
}

export const ICodentService = createDecorator<ICodentService>('ICodentService');
export class CodentService {
	run() {
		console.log('Running CodentService');
	}

}

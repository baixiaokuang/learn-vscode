/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CodentChannelId = 'codent';
export const CodentSecretKey = 'CodentAPIKey';
export type CodentCommand = 'ask' | 'sendRequest' | 'sendMessage';
export type CodentAskParams = {
	prompt: string;
	apiKey: string;
};

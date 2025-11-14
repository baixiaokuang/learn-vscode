/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CodentChannelId = 'codent';
export const CodentSecretKey = 'CodentAPIKey';
export type CodentCommand = 'ask' | 'edit' | 'sendRequest' | 'sendMessage';
export type CodentAskParams = {
	prompt: string;
	apiKey: string;
};
export type CodentEditParams = {
	prompt: string;
	apiKey: string;
};

export type CodentEditResult = {
	resource: string;          // URI you sent in CodentEditParams
	edits: Array<{
		startLine: number;       // 1-based inclusive
		endLine: number;         // 1-based inclusive
		replacement: string;     // literal text to insert
	}>;
};


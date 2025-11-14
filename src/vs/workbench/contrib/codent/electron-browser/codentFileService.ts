/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IResourceDiffEditorInput } from '../../../common/editor.js';
import { CodentEditResult } from '../../../../platform/codent/common/codentTypes.js';


export interface ICodentFileService {
	readonly _serviceBrand: undefined;
	getActiveFileContent: () => { uri: URI; value: string } | undefined;
	handleEdit: (edit: CodentEditResult) => Promise<void>;
}

export const ICodentFileService = createDecorator<ICodentFileService>('ICodentFileService');
export class CodentFileService extends Disposable implements ICodentFileService {
	readonly _serviceBrand: undefined;
	private readonly editPreviewContent = new Map<string, string>();
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();

		const provider: ITextModelContentProvider = {
			provideTextContent: (resource) => this.providePreviewContent(resource)
		};
		this._register(this.textModelService.registerTextModelContentProvider('codent-edit-before', provider));
		this._register(this.textModelService.registerTextModelContentProvider('codent-edit-after', provider));
	}

	async handleEdit(edit: CodentEditResult) {
		const uri = URI.parse(edit.resource);
		const editor = await this.editorService.openEditor({ resource: uri });
		const codeEditor = editor?.getControl();

		if (!isCodeEditor(codeEditor)) {
			return;
		}

		const originalUri = URI.parse(edit.resource);
		const originalText = codeEditor.getModel()?.getValue()!;

		const operations: ISingleEditOperation[] = edit.edits.map(hunk => ({
			range: new Range(hunk.startLine, 1, hunk.endLine, Number.MAX_SAFE_INTEGER),
			text: hunk.replacement,
			forceMoveMarkers: true
		}));

		codeEditor.executeEdits('codent', operations);


		const modifiedText = codeEditor.getModel()?.getValue()!;
		const tempUri1 = originalUri.with({
			scheme: 'codent-edit-before',
			fragment: String(Date.now())
		});
		const tempUri2 = originalUri.with({
			scheme: 'codent-edit-after',
			fragment: String(Date.now())
		});

		this.editPreviewContent.set(tempUri1.toString(), originalText);
		this.editPreviewContent.set(tempUri2.toString(), modifiedText);

		const diffInput: IResourceDiffEditorInput = {
			original: { resource: tempUri1 },
			modified: { resource: tempUri2 }
		};

		await this.editorService.openEditor(diffInput);
	}


	getActiveFileContent(): { uri: URI; value: string } | undefined {
		const control = this.editorService.activeTextEditorControl;
		const codeEditor = isCodeEditor(control)
			? control
			: isDiffEditor(control)
				? control.getModifiedEditor()
				: undefined;

		const model = codeEditor?.getModel();
		if (!model) { return; }

		return { uri: model.uri, value: model.getValue() };
	}


	private async providePreviewContent(resource: URI) {
		const key = resource.toString();
		const text = this.editPreviewContent.get(key);
		if (text === undefined) {
			throw new Error(`No preview content stored for ${resource.toString()}`);
		}
		let model = this.modelService.getModel(resource);
		if (!model) {
			model = this.modelService.createModel(text, null, resource);
		}
		this.editPreviewContent.delete(key);
		return model;
	}
}

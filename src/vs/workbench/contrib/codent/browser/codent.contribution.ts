/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import './codentAction.js';
import { CodentViewPane } from './codentViewPane.js';

const CHAT_SIDEBAR_PANEL_ID = 'workbench.panel.codent';
const chatViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: CHAT_SIDEBAR_PANEL_ID,
	title: localize2('codent.viewContainer.label', "Codent"),
	// icon: Codicon.chatSparkle,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [CHAT_SIDEBAR_PANEL_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: CHAT_SIDEBAR_PANEL_ID,
	hideIfEmpty: true,
	order: 1,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

const CodentViewId = 'workbench.panel.codent.view.chat';
const chatViewDescriptor: IViewDescriptor[] = [{
	id: CodentViewId,
	// containerIcon: chatViewContainer.icon,
	containerTitle: 'Codent',
	singleViewPaneContainerTitle: 'Codent',
	name: localize2('codent.viewContainer.label', "Codent"),
	canToggleVisibility: false,
	canMoveView: true,
	// openCommandActionDescriptor: {
	// 	id: CHAT_SIDEBAR_PANEL_ID,
	// 	title: chatViewContainer.title,
	// 	mnemonicTitle: localize({ key: 'miToggleChat', comment: ['&& denotes a mnemonic'] }, "&&Chat"),
	// 	keybindings: {
	// 		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
	// 		mac: {
	// 			primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
	// 		}
	// 	},
	// 	order: 1
	// },
	ctorDescriptor: new SyncDescriptor(CodentViewPane),
	// when: ContextKeyExpr.or(
	// 	ContextKeyExpr.or(
	// 		ChatContextKeys.Setup.hidden,
	// 		ChatContextKeys.Setup.disabled
	// 	)?.negate(),
	// 	ChatContextKeys.panelParticipantRegistered,
	// 	ChatContextKeys.extensionInvalid
	// )
}];
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(chatViewDescriptor, chatViewContainer);

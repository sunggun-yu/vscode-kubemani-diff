import * as vscode from 'vscode';
import { KubeItemView } from './kubeItemView';
import { FileSelectorView } from './fileSelectorView';

export function activate(context: vscode.ExtensionContext) {
	new KubeItemView(context);
	new FileSelectorView(context);
}

export function deactivate() {}

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileSelectorView {

  readonly provider: FileSelectorViewProvider;

  constructor(context: vscode.ExtensionContext) {
    this.provider = new FileSelectorViewProvider();
    const view = vscode.window.createTreeView('kubemani-file-view', { treeDataProvider: this.provider, showCollapseAll: true });
    context.subscriptions.push(view);
    vscode.commands.registerCommand('kubemani-diff.selectFiles', this.provider.selectFiles);
    vscode.commands.registerCommand('kubemani-diff.openFileA', this.provider.openFileA);
    vscode.commands.registerCommand('kubemani-diff.openFileB', this.provider.openFileB);
    vscode.commands.registerCommand('kubemani-diff.reset', this.provider.reset);
  }
}

export class FileSelectorViewProvider implements vscode.TreeDataProvider<File> {

  private _onDidChangeTreeData: vscode.EventEmitter<any | undefined> = new vscode.EventEmitter<any | undefined>();
  readonly onDidChangeTreeData: vscode.Event<any | undefined> = this._onDidChangeTreeData.event;

  private fileA = new File("Click to select a file A", "A");
  private fileB = new File("Click to select a file B", "B");

  getTreeItem(element: File): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(): vscode.ProviderResult<File[]> {
    return [this.fileA, this.fileB];
  }

  updateKubeItems() {
    if (this.fileA.resourceUri && this.fileB.resourceUri) {
      vscode.commands.executeCommand('kubemani-diff.updateKubeItem', this.fileA.resourceUri, this.fileB.resourceUri);
      vscode.commands.executeCommand('kubemani-file-view.focus');
    }
  }

  selectFiles = async (_e: vscode.Uri, uris: [vscode.Uri, vscode.Uri]) => {

    for (var f of uris) {
      if (!fs.lstatSync(f.fsPath).isFile()) {
        await vscode.window.showErrorMessage("Please select 2 files to compare Kubernetes manifest");
        return;
      }
    }

    this.fileA = new File(path.basename(uris[0].fsPath), "A", uris[0]);
    this.fileB = new File(path.basename(uris[1].fsPath), "B", uris[1]);
    this._onDidChangeTreeData.fire(null);

    this.updateKubeItems();
    return;
  };

  openFileA = async (_e: vscode.Uri) => {
    const uri = await openFile();
    if (uri !== undefined) {
      this.fileA = new File(path.basename(uri.fsPath), "A", uri);
      this._onDidChangeTreeData.fire(null);
      this.updateKubeItems();
    }
  };

  openFileB = async (_e: vscode.Uri) => {
    const uri = await openFile();
    if (uri !== undefined) {
      this.fileB = new File(path.basename(uri.fsPath), "B", uri);
      this._onDidChangeTreeData.fire(null);
      this.updateKubeItems();
    }
  };
  
  reset = async () => {
    this.fileA = new File("Click to select a file A", "A");
    this.fileB = new File("Click to select a file B", "B");
    vscode.commands.executeCommand('kubemani-diff.updateKubeItem', undefined, undefined);
    this._onDidChangeTreeData.fire(null);
  };
}

export async function openFile(): Promise<vscode.Uri | undefined> {
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: 'Open',
    filters: {
      'Yaml files': ['yaml', 'yml'],
      'All files': ['*']
    }
  };

  const fileUri = await vscode.window.showOpenDialog(options);
  if (fileUri && fileUri[0]) {
    return Promise.resolve(fileUri[0]);
  }
  return Promise.resolve(undefined);
}

type FileContext = 'A' | 'B';

export class File extends vscode.TreeItem {

  constructor(
    public label: string,
    public readonly fileContext: FileContext,
    public resourceUri?: vscode.Uri | undefined,
    public readonly command?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = this.fileContext;
    this.command = this.getCommand();
    this.iconPath = this.getIcon();
  }

  private getIcon(): any {
    if (this.resourceUri === undefined) {
      return {
        light: path.join(__filename, '..', '..', 'resources', 'light', 'folder-opened.svg'),
        dark: path.join(__filename, '..', '..', 'resources', 'dark', 'folder-opened.svg')
      };
    }
    return {
      light: path.join(__filename, '..', '..', 'resources', 'light', `item-in-file-${this.fileContext}.svg`),
      dark: path.join(__filename, '..', '..', 'resources', 'dark', `item-in-file-${this.fileContext}.svg`),
    };
  }

  private getCommand(): vscode.Command {
    if (this.resourceUri === undefined && this.fileContext === "A") {
      return { title: '', command: 'kubemani-diff.openFileA' };
    }
    if (this.resourceUri === undefined && this.fileContext === "B") {
      return { title: '', command: 'kubemani-diff.openFileB' };
    }
    return { title: '', command: 'vscode.open', arguments: [this.resourceUri] };
  }
}

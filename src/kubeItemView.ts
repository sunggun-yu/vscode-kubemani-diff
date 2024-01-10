import * as vscode from 'vscode';
import * as path from 'path';
import { KubeBaseObject, ItemOf } from "./lib/types";
import { readYamlFile, KubeContent } from "./lib/services";
import { Logger } from "./utils/logger";
import { createTempDirectory, deleteDirectory, createSubDirectory, getBaseDirname } from './utils/files';

export class KubeItemView {

  constructor(context: vscode.ExtensionContext) {
    const provider = new KubeItemViewProvider();
    const view = vscode.window.createTreeView('kubemani-tree-view', { treeDataProvider: provider, showCollapseAll: true, canSelectMany: true });
    context.subscriptions.push(provider, view);
    vscode.commands.registerCommand('kubemani-diff.diffSelectedItem', item => provider.diffSelectedItem(item));
    vscode.commands.registerCommand('kubemani-diff.diffSelectedItems', provider.diffSelectedItems);
    vscode.commands.registerCommand('kubemani-diff.updateKubeItem', provider.update);
  }
}

enum KubeItemType {
  API,
  Kind,
  Item,
  None
}

export class KubeItem extends vscode.TreeItem {

  children: KubeItem[];
  public A?: KubeContent | undefined;
  public B?: KubeContent | undefined;

  constructor(
    public readonly type: KubeItemType,
    public readonly label: string,
    public readonly paths: string
  ) {
    let collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    const sortYaml = vscode.workspace.getConfiguration().get('kubemaniTreeView.expandAll');
    if (sortYaml) {
      collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    if (type === KubeItemType.Item) {
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
    super(label, collapsibleState);

    this.id = paths;
    this.tooltip = this.label;
    this.children = [];
    this.iconPath = this.getIcon();
    this.contextValue = (this.type === KubeItemType.Item) ? "kube-item" : undefined;
  }

  addChild(type: KubeItemType, label: string, path: string): KubeItem {
    const newNode = new KubeItem(type, label, path);
    this.children.push(newNode);
    return newNode;
  }

  private getIcon(): any {
    if (this.type === KubeItemType.Item) {
      const appeared = this.appeared();
      if (appeared) {
        if (appeared === "AB") {
          if (this.A?.doc === this.B?.doc) {
            return {
              light: path.join(__filename, '..', '..', 'resources', 'light', `item-in-file-${appeared}-no-diff.svg`),
              dark: path.join(__filename, '..', '..', 'resources', 'dark', `item-in-file-${appeared}-no-diff.svg`),
            };
          }
        }
        return {
          light: path.join(__filename, '..', '..', 'resources', 'light', `item-in-file-${appeared}.svg`),
          dark: path.join(__filename, '..', '..', 'resources', 'dark', `item-in-file-${appeared}.svg`),
        };
      }
      return {
        light: path.join(__filename, '..', '..', 'resources', 'light', 'file.svg'),
        dark: path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg')
      };
    }
    return {
      light: path.join(__filename, '..', '..', 'resources', 'light', 'folder.svg'),
      dark: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')
    };
  }

  appeared(): string | undefined {
    if (this.A && this.B) {
      return "AB";
    }
    if (this.A && !this.B) {
      return "A";
    }
    if (!this.A && this.B) {
      return "B";
    }
    return undefined;
  }

  updateIconPath() {
    this.iconPath = this.getIcon();
  }
}

/**
 * KubeItemViewProvider
 */
export class KubeItemViewProvider implements vscode.TreeDataProvider<KubeItem>, vscode.Disposable {

  private _onDidChangeTreeData: vscode.EventEmitter<any | undefined> = new vscode.EventEmitter<any | undefined>();
  readonly onDidChangeTreeData: vscode.Event<any | undefined> = this._onDidChangeTreeData.event;

  private kubeTree: KubeItem[] = [];
  private tempRootPath: vscode.Uri | undefined = undefined;

  getTreeItem(element: KubeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: KubeItem): Thenable<KubeItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }
    return Promise.resolve(this.kubeTree);
  }

  // reset function deletes temporary directory and kubeTree data
  reset = async () => {
    if (this.tempRootPath) {
      deleteDirectory(this.tempRootPath);
    }
    this.tempRootPath = undefined;
    this.kubeTree = [];
    this._onDidChangeTreeData.fire(null);
  };

  // update function read and parse tree data from both yaml file and update the view
  update = async (fileA: vscode.Uri, fileB: vscode.Uri) => {
    // reset current view and data
    this.reset();

    if (fileA && fileB) {

      const kubeObjsA = readYamlFile(fileA.fsPath);
      if (!kubeObjsA) {
        await vscode.window.showErrorMessage("Failed parse File A as Kubernetes Manifest Yaml");
        return;
      }

      const kubeObjsB = readYamlFile(fileB.fsPath);
      if (!kubeObjsB) {
        await vscode.window.showErrorMessage("Failed parse File B as Kubernetes Manifest Yaml");
        return;
      }

      try {
        this.tempRootPath = createTempDirectory();
      } catch (err) {
        await vscode.window.showErrorMessage("Failed to create the temp directory");
        return;
      }

      const root = new KubeItem(KubeItemType.None, "root", "");
      const treeA = createTreeFromYAML(root, kubeObjsA, this.tempRootPath, "A");
      const treeB = createTreeFromYAML(treeA, kubeObjsB, this.tempRootPath, "B");

      this.kubeTree = treeB.children;

      this._onDidChangeTreeData.fire(null);
    }
    return;
  };

  async diffSelectedItem(item: KubeItem) {
    if (item.A && item.B) {
      await vscode.commands.executeCommand('vscode.diff', item.A.docUri, item.B.docUri, `KubeMani Diff - ${item.paths}`);
      return Promise.resolve();
    }
    if (item.A && !item.B) {
      await vscode.commands.executeCommand('vscode.open', item.A.docUri);
      return Promise.resolve();
    }
    if (!item.A && item.B) {
      await vscode.commands.executeCommand('vscode.open', item.B.docUri);
      return Promise.resolve();
    }
  }

  /**
   * Performs a diff operation on selected KubeItems but orphan items.
   * @param _e 
   * @param items An array containing two KubeItem objects to compare
   * @returns A Promise that resolves after the diff operation is performed
   */
  diffSelectedItems = async (_e: KubeItem, items: [KubeItem, KubeItem]) => {
    const uris: vscode.Uri[] = [];
    for (let item of items) {
      if (!item.appeared() || item.appeared() === "AB") {
        await vscode.window.showErrorMessage("Cannot compare selected items");
        return Promise.resolve(undefined);
      }
      if (item.A?.docUri) {
        uris.push(item.A.docUri);
        continue;
      }
      if (item.B?.docUri) {
        uris.push(item.B.docUri);
        continue;
      }
    }
    await vscode.commands.executeCommand('vscode.diff', uris[0], uris[1], `KubeMani Diff - ${getBaseDirname(uris[0])} - ${getBaseDirname(uris[1])}`);
    return Promise.resolve();
  };

/**
 * implement vscode.Disposable to delete temp directory when vscode is closed
 */
  dispose() {
    this.reset();
  }
}

/**
 * Create TreeView from array of KubeBaseObject
 * @param root root of tree
 * @param objs array of KubeBaseObject
 * @param tempDir content root directory
 * @param itemOf A | B
 * @returns 
 */
function createTreeFromYAML(root: KubeItem, objs: KubeBaseObject[], tempDir: vscode.Uri, itemOf: ItemOf): KubeItem {

  for (const obj of objs) {

    let kubeContent: KubeContent;
    try {
      kubeContent = new KubeContent(obj, tempDir, itemOf);  
    } catch (error) {
      // skip for unexpected format of data
      Logger.warn(error);
      continue;
    }

    const api = kubeContent.api;
    const kind = kubeContent.kind;
    const name = kubeContent.name;

    let apiVersionNode = root.children.find(node => node.label === api);
    if (!apiVersionNode) {
      apiVersionNode = root.addChild(KubeItemType.API, api, api);
      apiVersionNode.resourceUri = kubeContent.apiUri;
    }

    let kindNode = apiVersionNode.children.find(node => node.label === kind);
    if (!kindNode) {
      kindNode = apiVersionNode.addChild(KubeItemType.Kind, kind, `${api}/${kind}`);
      kindNode.resourceUri = kubeContent.kindUri;
    }

    let nameNode = kindNode.children.find(node => node.label === name);
    if (!nameNode) {
      nameNode = kindNode.addChild(KubeItemType.Item, name, `${api}/${kind}/${name}`);
      nameNode.resourceUri = kubeContent.nameUri;
    }

    if (itemOf === "A") {
      nameNode.A = kubeContent;
    } 
    if (itemOf === "B") {
      nameNode.B = kubeContent;
    }

    if (nameNode.A && nameNode.B) {
      nameNode.contextValue = "kube-item-AB";
    }
    nameNode.updateIconPath();
  }

  return root;
}

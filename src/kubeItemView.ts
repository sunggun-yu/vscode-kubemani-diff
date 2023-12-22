import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
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

type KubeItemAppearsIn = "A" | "B" | "AB";

interface IKubeItem extends vscode.TreeItem {
  readonly type: KubeItemType;
  readonly label: string;
  readonly paths: string;
  appears?: KubeItemAppearsIn;
  readonly uriA?: vscode.Uri;
  readonly uriB?: vscode.Uri;
  children: KubeItem[];
  addChild(type: KubeItemType, label: string, path: string, appears?: KubeItemAppearsIn, uriA?: vscode.Uri, uriB?: vscode.Uri): KubeItem;
}

export class KubeItem extends vscode.TreeItem implements IKubeItem {

  children: KubeItem[];

  constructor(
    public readonly type: KubeItemType,
    public readonly label: string,
    public readonly paths: string,
    public appears?: KubeItemAppearsIn | undefined,
    public uriA?: vscode.Uri | undefined,
    public uriB?: vscode.Uri | undefined
  ) {

    // TODO: create config to set Collapsed or Expanded by default;
    var collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    if (type === KubeItemType.Item) {
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
    super(label, collapsibleState);

    this.id = paths;
    this.tooltip = this.label;
    this.children = [];
    this.iconPath = this.getIcon();
    this.contextValue = (this.type === KubeItemType.Item) ? "kube-item" : undefined;

    // this.command = { command: 'kubemani-diff.diffSelectedItem', title : "", arguments: [this] };
  }

  addChild(type: KubeItemType, label: string, path: string, appears?: KubeItemAppearsIn, uriA?: vscode.Uri | undefined, uriB?: vscode.Uri | undefined): KubeItem {
    const newNode = new KubeItem(type, label, path, appears, uriA, uriB);
    this.children.push(newNode);
    return newNode;
  }

  private getIcon(): any {
    if (this.type === KubeItemType.Item) {

      if (this.appears) {
        return {
          light: path.join(__filename, '..', '..', 'resources', 'light', `item-in-file-${this.appears}.svg`),
          dark: path.join(__filename, '..', '..', 'resources', 'dark', `item-in-file-${this.appears}.svg`),
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

  updateIconPath() {
    this.iconPath = this.getIcon();
  }
}

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

      const kubeObjsA = parseYamlFile(fileA.fsPath);
      if (!kubeObjsA) {
        await vscode.window.showErrorMessage("Failed parse File A as Kubernetes Manifest Yaml");
        return;
      }

      const kubeObjsB = parseYamlFile(fileB.fsPath);
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
    if (item.uriA && item.uriB) {
      await vscode.commands.executeCommand('vscode.diff', item.uriA, item.uriB, `KubeMani Diff - ${item.paths}`);
      return Promise.resolve();
    }
    if (item.uriA && !item.uriB) {
      await vscode.commands.executeCommand('vscode.open', item.uriA);
      return Promise.resolve();
    }
    if (!item.uriA && item.uriB) {
      await vscode.commands.executeCommand('vscode.open', item.uriB);
      return Promise.resolve();
    }
  }

  diffSelectedItems = async (_e: KubeItem, items: [KubeItem, KubeItem]) => {
    const uris: vscode.Uri[] = [];
    for (let item of items) {
      if (!item.appears || item.appears === "AB") {
        await vscode.window.showErrorMessage("Cannot compare selected items");
        return Promise.resolve(undefined);
      }
      if (item.uriA) {
        uris.push(item.uriA);
        continue;
      }
      if (item.uriB) {
        uris.push(item.uriB);
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

// Interface for KubernetesObject
interface KubernetesObject {
  readonly apiVersion: string;
  readonly  kind: string;
  readonly metadata: {
    readonly name: string;
  };
}

/**
 * Parses a YAML file located at the provided file path and returns an array of KubernetesObject.
 * @param {string} filePath - The path to the YAML file to be parsed.
 * @returns {KubernetesObject[] | null} An array of KubernetesObject if parsing is successful,
 *   otherwise returns null in case of any errors during file reading or parsing.
 */
const parseYamlFile = (filePath: string): KubernetesObject[] | null => {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const parsedObjects: KubernetesObject[] = [];
    let ignored = 0;
    yaml.loadAll(fileContents, (doc) => {
      const parsedDoc = doc as KubernetesObject;
      if (!parsedDoc) {
        Logger.warn(`empty document has included in the ${filePath}. it will be ignored`);
        ignored++;
        return;
      }
      parsedObjects.push(parsedDoc);
    });
    Logger.info(`${parsedObjects.length} objects are found and ${ignored} are ignored in the ${filePath}`);
    return parsedObjects;
  } catch (e) {
    Logger.error(`Error reading file ${filePath}: ${e}`);
    return null;
  }
};

function createTreeFromYAML(root: KubeItem, yamlData: KubernetesObject[], tempDir: vscode.Uri, appears: KubeItemAppearsIn): KubeItem {

  for (const obj of yamlData) {

    if (!obj.apiVersion || !obj.kind || !obj.metadata || !obj.metadata.name) {
      Logger.warn(`unexpected format of object as Kubernetes manifest. the object will be ignored: \n${yaml.dump(obj)}`);
      continue;
    }

    const { apiVersion, kind, metadata: { name } } = obj;
    const apiVersionArray = apiVersion.split('/');
    const api = apiVersionArray.length > 1 ? apiVersionArray[0] : 'core';

    let apiVersionNode = root.children.find(node => node.label === api);
    if (!apiVersionNode) {
      const uri = createSubDirectory(tempDir, api);
      apiVersionNode = root.addChild(KubeItemType.API, api, api);
      apiVersionNode.resourceUri = uri;
    }

    let kindNode = apiVersionNode.children.find(node => node.label === kind);
    if (!kindNode) {
      const uri = createSubDirectory(apiVersionNode.resourceUri, kind);
      kindNode = apiVersionNode.addChild(KubeItemType.Kind, kind, `${api}/${kind}`);
      kindNode.resourceUri = uri;
    }

    if (name) {
      let nameNode = kindNode.children.find(node => node.label === name);
      const uri = createSubDirectory(kindNode.resourceUri, name);
      const fileUri = createTempFileFromKubernetesObject(obj, uri, appears);

      if (nameNode) {
        if ((nameNode.uriA && appears === "B") || (nameNode.uriB && appears === "A")) {
          nameNode.appears = "AB";
          nameNode.contextValue = "kube-item-AB";
          nameNode.updateIconPath();
        }
      } else {
        nameNode = kindNode.addChild(KubeItemType.Item, name, `${api}/${kind}/${name}`, appears);
      }

      nameNode.resourceUri = uri;
      if (appears === "A") {
        nameNode.uriA = fileUri;
      } 
      if (appears === "B") {
        nameNode.uriB = fileUri;
      }
    }
  }

  return root;
}

/**
 * Creates a temporary YAML file from the provided KubernetesObject content.
 * @param {KubernetesObject} content - The KubernetesObject content to be written into the temporary file.
 * @param {vscode.Uri | undefined} dir - The directory where the temporary file will be created.
 * @param {KubeItemAppearsIn} appears - Indicates the appearance status ('A' or 'B') of the content.
 * @returns {vscode.Uri} The URI of the created temporary file.
 * @throws {Error} Throws an error if the directory is undefined or encounters an error while creating the file.
 */
function createTempFileFromKubernetesObject(content: KubernetesObject, dir: vscode.Uri | undefined, appears: KubeItemAppearsIn): vscode.Uri {

  if (!dir) {
    throw new Error("Dir is not defined");
  }

  const filePath = path.join(dir.fsPath, `${appears}.yaml`);
  try {
    fs.writeFileSync(filePath, yaml.dump(content));
    const fileUri = vscode.Uri.file(filePath);
    return fileUri;
  } catch (err) {
    Logger.error('Error creating temporary file:', err);
    throw err;
  }
}

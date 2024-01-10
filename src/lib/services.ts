import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { KubeBaseObject, ItemOf } from "./types";
import { Logger } from "../utils/logger";

/**
 * Reads a YAML file located at the provided file path and returns an array of KubeBaseObject.
 * @param {string} filePath - The path to the YAML file to be parsed.
 * @returns {KubeBaseObject[] | null} An array of KubeBaseObject if parsing is successful,
 *   otherwise returns null in case of any errors during file reading or parsing.
 */
export const readYamlFile = (filePath: string): KubeBaseObject[] | null => {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const parsedObjects: KubeBaseObject[] = [];
    let ignored = 0;
    yaml.loadAll(fileContents, (doc) => {
      const parsedDoc = doc as KubeBaseObject;
      if (!parsedDoc) {
        Logger.warn(`An empty document has been included in ${filePath} and will be ignored.`);
        ignored++;
        return;
      }
      parsedObjects.push(parsedDoc);
    });
    Logger.info(`${parsedObjects.length} objects found, and ${ignored} ignored in ${filePath}`);
    return parsedObjects;
  } catch (e) {
    Logger.error(`Error reading file ${filePath}: ${e}`);
    return null;
  }
};

/**
 * Converts a KubeBaseObject to a YAML string.
 * @param {KubeBaseObject} obj - The KubeBaseObject to be converted.
 * @param {boolean} [sort=false] - Optional. Whether to sort the keys in the YAML output.
 * @returns {string} A YAML string representation of the provided KubeBaseObject.
 */
export const kubeBaseObjectToYamlString = (obj: KubeBaseObject, sort: boolean = false): string => {
  return yaml.dump(obj, { sortKeys: sort });
};

export class KubeContent {
  public readonly doc: string;
  public readonly api: string;
  public readonly kind: string;
  public readonly name: string;
  public readonly apiUri: vscode.Uri;
  public readonly kindUri: vscode.Uri;
  public readonly nameUri: vscode.Uri;
  public readonly docUri: vscode.Uri;

  constructor(
    public obj: KubeBaseObject,
    public contentRootDir: vscode.Uri,
    public itemOf: ItemOf
  ) {
    if (!obj.apiVersion || !obj.kind || !obj.metadata || !obj.metadata.name) {
      throw new Error(`unexpected format of object as Kubernetes manifest. the object will be ignored: \n${yaml.dump(obj)}`);
    }

    // init properties
    const apiVersion = obj.apiVersion;
    const apiVersionArray = apiVersion.split('/');
    this.api = apiVersionArray.length > 1 ? apiVersionArray[0] : 'core';
    this.kind = obj.kind;
    this.name = obj.metadata.name;

    // generate YAML document string
    this.doc = this.toString();

    // init kube object properties
    this.apiUri = vscode.Uri.file(path.join(this.contentRootDir.fsPath, this.api));
    this.kindUri = vscode.Uri.file(path.join(this.apiUri.fsPath, this.kind));
    this.nameUri = vscode.Uri.file(path.join(this.kindUri.fsPath, this.name));
    this.docUri = vscode.Uri.file(path.join(this.nameUri.fsPath, `${this.itemOf}.yaml`));

    // create kube object file
    this.createFile();
  }

  private createFile() {
    // Check if the directory exists, if not, create it
    if (!fs.existsSync(this.nameUri.fsPath)) {
      fs.mkdirSync(this.nameUri.fsPath, { recursive: true });
    }

    try {
      fs.writeFileSync(this.docUri.fsPath, this.doc);
    } catch (err) {
      Logger.error(`Error creating kubernetes object manifest file for ${this.api}/${this.kind}/${this.name}/${this.itemOf}:`, err);
      throw err;
    }
  }

  private toString = (): string => {
    const sortYaml = vscode.workspace.getConfiguration().get('editor.sortYaml');
    return kubeBaseObjectToYamlString(this.obj, sortYaml ? true : false);
  };
}

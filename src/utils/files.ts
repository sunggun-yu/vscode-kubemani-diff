import os from 'os';
import path from 'path';
import fs from 'fs';
import vscode from 'vscode';
import { randomBytes } from 'crypto';
import { Logger } from "./logger";

/**
 * Creates a temporary directory for comparison that stores breakdowns of Kubernetes Manifest objects.
 * @returns The URI of the created temporary directory.
 */
export function createTempDirectory(): vscode.Uri {
  const tmpDir = os.tmpdir();
  const randomBytesCount = 16;
  const randomDirName = randomBytes(randomBytesCount).toString('hex');
  const tempDirPath = path.join(tmpDir, `kubemani-diff-temp-${randomDirName}`);

  try {
    fs.mkdirSync(tempDirPath);
    Logger.info(`temp directory has been created at: ${tempDirPath}`);
    return vscode.Uri.file(tempDirPath);
  } catch (err) {
    Logger.error('error creating temporary directory:', err);
    throw err;
  }
}

/**
 * Checks if the provided vscode.Uri represents a directory.
 * @param uri - The vscode.Uri to check.
 * @returns A boolean indicating whether the vscode.Uri represents a directory.
 */
export function isDirectory(uri: vscode.Uri): boolean {
  if (!uri || !uri.fsPath ) {
    return false;
  }
  try {
    const stats = fs.statSync(uri.fsPath);
    return stats.isDirectory();
  } catch (error) {
    Logger.error(`error checking if '${uri.fsPath}' is a directory:`, error);
    return false;
  }
}

/**
 * Checks if the provided vscode.Uri represents a file.
 * @param uri - The vscode.Uri to check.
 * @returns A boolean indicating whether the vscode.Uri represents a file.
 */
export function isFile(uri: vscode.Uri): boolean {
  if (!uri || !uri.fsPath ) {
    return false;
  }
  try {
    const stats = fs.statSync(uri.fsPath);
    return stats.isFile();
  } catch (error) {
    Logger.error(`error checking if '${uri.fsPath}' is a file:`, error);
    return false;
  }
}

/**
 * Deletes the directory specified by the provided URI.
 * @param uri - The URI of the directory to delete.
 */
export function deleteDirectory(uri: vscode.Uri): void {
  if (!isDirectory(uri)) {
    return;
  }
  if (fs.existsSync(uri.fsPath)) {
    fs.rmSync(uri.fsPath, { recursive: true });
    Logger.info(`directory '${uri.fsPath}' deleted successfully.`);
  } else {
    Logger.error(`directory '${uri.fsPath}' does not exist.`);
  }
}

/**
 * Creates a subdirectory under the specified base URI.
 * @param baseUri - The base URI where the subdirectory will be created.
 * @param subPath - The path of the subdirectory.
 * @returns The URI of the created subdirectory.
 */
export function createSubDirectory(baseUri: vscode.Uri | undefined, subPath: string): vscode.Uri {
  if (!baseUri || !baseUri.fsPath || !subPath) {
    const err = new Error("invalid arguments");
    Logger.error(err);
    throw err;
  }
  const subDirectoryPath = path.join(baseUri.fsPath, subPath);
  try {
    fs.mkdirSync(subDirectoryPath, { recursive: true });
    return vscode.Uri.file(subDirectoryPath);
  } catch (err) {
    Logger.error(`error creating subdirectory '${subPath}' under '${baseUri.fsPath}':`, err);
    throw err;
  }
}

/**
 * Returns directory name of file or directory
 * @param uri the vscode.Uri of file or directory
 * @returns 
 */
export function getBaseDirname(uri: vscode.Uri): string | undefined {
  if (isFile(uri)) {
    return path.basename(path.dirname(uri.fsPath));
  } else if (isDirectory(uri)) {
    return path.basename(uri.fsPath);
  }
  return undefined;
}

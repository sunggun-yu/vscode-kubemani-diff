import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createTempDirectory,
  isDirectory,
  isFile,
  deleteDirectory,
  createSubDirectory,
  getBaseDirname,
} from '../../utils/files';

suite('Files util unit test', () => {
  test('createTempDirectory', () => {
    const tempDirUri = createTempDirectory();
    assert.ok(tempDirUri !== undefined && tempDirUri !== null);
    assert.ok(tempDirUri instanceof vscode.Uri);
    deleteDirectory(tempDirUri);
    assert.strictEqual(isDirectory(tempDirUri), false);
  });

  test('isDirectory', () => {
    const tempDirUri = createTempDirectory();
    assert.strictEqual(isDirectory(tempDirUri), true);
    deleteDirectory(tempDirUri);
  });

  test('isFile', () => {
    const tempDirUri = createTempDirectory();
    const tempFile = path.join(tempDirUri.fsPath, 'tempFileTest.txt');
    try {
      fs.writeFileSync(tempFile, "test");
    } catch (err) {
      console.error('Error creating temp file:', err);
    }
    const tempFileUri = vscode.Uri.file(tempFile);
    assert.strictEqual(isFile(tempFileUri), true);
    deleteDirectory(tempDirUri);
  });

  test('createSubDirectory', () => {
    const tempDirUri = createTempDirectory();
    const subDirectoryPath = 'subdirectory';
    const subDirUri = createSubDirectory(tempDirUri, subDirectoryPath);
    assert.strictEqual(isDirectory(subDirUri), true);
    deleteDirectory(tempDirUri);
  });

  test('getBaseDirname-dir', () => {
    const tempDirUri = createTempDirectory();
    const subDirectoryPath = 'subdirectory';
    const subDirUri = createSubDirectory(tempDirUri, subDirectoryPath);
    assert.strictEqual(getBaseDirname(subDirUri), subDirectoryPath);
    deleteDirectory(tempDirUri);
  });

  test('getBaseDirname-file', () => {
    const tempDirUri = createTempDirectory();
    const subDirectoryPath = 'subdirectory';
    const subDirUri = createSubDirectory(tempDirUri, subDirectoryPath);
    const tempFile = path.join(subDirUri.fsPath, 'tempFileTest.txt');
    try {
      fs.writeFileSync(tempFile, "test");
    } catch (err) {
      console.error('Error creating temp file:', err);
    }
    const tempFileUri = vscode.Uri.file(tempFile);
    assert.strictEqual(getBaseDirname(subDirUri), subDirectoryPath);
    deleteDirectory(tempDirUri);
  });
});

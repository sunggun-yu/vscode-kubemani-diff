import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTempDirectory } from '../../utils/files';

describe('createTempDirectory', () => {
  it('should create a temporary directory and return a vscode.Uri', () => {
    const tempDirUri = createTempDirectory();
    assert.ok(tempDirUri !== undefined && tempDirUri !== null);
    assert.ok(tempDirUri instanceof vscode.Uri);
  });
});

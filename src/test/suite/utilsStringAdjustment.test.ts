import * as assert from 'assert';
import * as vscode from 'vscode';
import * as utils from '../../utils';

suite('ActionGroup Extension utils string adjustment Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('test simple \\n', () => {
        assert.strictEqual(utils.userInput2String('bla\\nblub'), 'bla\nblub');
    });
});

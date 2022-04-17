import * as assert from "assert";
import { beforeEach, afterEach } from "mocha";
import * as vscode from "vscode";
import * as terminalUtils from "../../terminal";

suite('ActionGroup Extension "terminal" Test Suite', () => {
    vscode.window.showInformationMessage(
        "Start all terminal preparation tests."
    );
    let testTerminal0: vscode.Terminal;
    let testTerminal1: vscode.Terminal;
    let testTerminal2: vscode.Terminal;

    beforeEach(() => {
        testTerminal0 = vscode.window.createTerminal("PrepTestTerminal0");
        testTerminal1 = vscode.window.createTerminal("PrepTestTerminal1");
        testTerminal2 = vscode.window.createTerminal("PrepTestTerminal2");
    });

    afterEach(() => {
        for (let i = 0; vscode.window.terminals.length > i; ++i) {
            let terminal = vscode.window.terminals[i];
            terminal.dispose();
        }
    });

    test("getTerminalWithName valid terminal return", () => {
        let terminalName = "PrepTestTerminal1";
        let terminal = terminalUtils.getTerminalWithName(terminalName);
        assert.strictEqual(terminal, testTerminal1);
    });

    test("getTerminalWithName invalid terminal return", () => {
        let terminalName = "RandomName";
        let terminal = terminalUtils.getTerminalWithName(terminalName);
        assert.strictEqual(typeof terminal, typeof null);
    });
});

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { TerminalAction, getActionGroups } from "./configuration";
import { getTerminalName, prepareTerminalInst } from "./terminal";
import { delay } from "./utils";

async function runTerminalAction(actionGroupName: string, terminalAction: TerminalAction) {
    const terminalName = getTerminalName(actionGroupName, terminalAction);

    let terminal = await prepareTerminalInst(terminalName, terminalAction);
    if (!terminal) {
        vscode.window.showErrorMessage(`Failed to get or create a terminal instance named "${terminalName}".`);
        return;
    }

    if (terminalAction.showTerminal) {
        terminal.show();
    }

    if (terminalAction.delayCommand && (typeof terminalAction.delayCommand === 'number')) {
        await delay(terminalAction.delayCommand);
    }

    console.log(`Executing command "${terminalAction.command}" in terminal "${terminalName}".`);
    terminal.sendText(terminalAction.command, true);
}

async function selectAndRunGroup(uri: vscode.Uri | undefined) {
    const commands = getActionGroups();
    const commandNames = commands.map(command => command.name);

    const selection = await vscode.window.showQuickPick(commandNames);

    if (!selection) {
        return;
    }
    vscode.window.showInformationMessage(`Executing command selection "${selection}".`);

    const command = commands.find(command => command.name === selection);
    command?.terminals.forEach(terminal =>
        runTerminalAction(selection, terminal)
    );
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "action-group-executer" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('action-group-executer.executeActionGroup', selectAndRunGroup);

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }

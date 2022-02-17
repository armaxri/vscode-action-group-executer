// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { getActionGroups } from "./configuration";
import { runTerminalAction } from "./terminal";
import { runDebugSession } from "./debugSession";
import { runProcesses, killCurrentProcess, killAllProcesses } from "./process";

async function selectAndRunGroup() {
    console.log(`selectAndRunGroup was triggered.`);
    const commands = getActionGroups();
    const commandNames = commands.map(command => command.name);

    const selection = await vscode.window.showQuickPick(commandNames);

    if (!selection) {
        console.log(`No valid selection was taken.`);
        return;
    }
    console.log(`Executing command selection "${selection}".`);
    vscode.window.showInformationMessage(`Executing command selection "${selection}".`);

    const command = commands.find(command => command.name === selection);
    console.log(`Picked command named "${command?.name}".`);

    if (command) {
        if (command.debugSession) {
            runDebugSession(command);
        }

        command.terminals.forEach(terminal =>
            runTerminalAction(terminal)
        );

        runProcesses(command);
    }
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
    context.subscriptions.push(vscode.commands.registerCommand('action-group-executer.executeActionGroup', selectAndRunGroup));
    context.subscriptions.push(vscode.commands.registerCommand('action-group-executer.killProcessAtBehindCurrentFile', killCurrentProcess));
    context.subscriptions.push(vscode.commands.registerCommand('action-group-executer.killAllProcesses', killAllProcesses));
}

// this method is called when your extension is deactivated
export function deactivate() { }

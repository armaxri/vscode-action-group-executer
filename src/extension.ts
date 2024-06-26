// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import {
    ActionGroup,
    ActionGroupPickGroup,
    getActionGroups,
} from "./configuration";
import { runTerminalAction } from "./terminal";
import { runDebugSession } from "./debugSession";
import {
    runProcesses,
    controlRunningProcess,
    sendMessage2RunningProcess,
    killCurrentProcess,
    killAllProcesses,
} from "./process";

async function selectAndRunGroup() {
    console.log(`selectAndRunGroup was triggered.`);
    const commands = getActionGroups();
    var command = await vscode.window.showQuickPick(commands);

    while (command instanceof ActionGroupPickGroup) {
        console.log(`Selected group "${command.label}".`);
        command = await vscode.window.showQuickPick(command.getSortedMembers());
    }

    if (!(command instanceof ActionGroup)) {
        console.log(`No valid selection was taken.`);
        return;
    }
    console.log(`Executing command selection "${command.label}".`);
    vscode.window.showInformationMessage(
        `Executing command selection "${command.label}".`
    );

    // Adjust the commands by creating debugging sessions from processes and terminals.
    // This is also a point were the execution of the whole group can
    // be stopped.
    if (await command.check4ProcessDebugging()) {
        console.log(`Execution was aborted during selection of debug session.`);
        return;
    }

    if (command.debugSession) {
        runDebugSession(command);
    }

    command.terminals.forEach((terminal) => runTerminalAction(terminal));

    runProcesses(command);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log(
        'Congratulations, your extension "action-group-executer" is now active!'
    );

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.executeActionGroup",
            selectAndRunGroup
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.controlRunningProcess",
            controlRunningProcess
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.sendMessage2RunningProcess",
            sendMessage2RunningProcess
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.killProcessAtBehindCurrentFile",
            killCurrentProcess
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.killAllProcesses",
            killAllProcesses
        )
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
    // Make sure that no process is running anymore after the windows was closed.
    killAllProcesses();
}

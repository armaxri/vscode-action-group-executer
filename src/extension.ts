// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import {
    ActionGroup,
    ActionGroupPickGroup,
    ActionGroupReference,
    NestedActionGroupPickItem,
    findActionGroups,
    getActionGroups,
    getNestedActionGroupItems,
    isActionGroupReference,
} from "./configuration";
import { runTerminalAction } from "./terminal";
import { runDebugSession } from "./debugSession";
import { runTaskAction } from "./task";
import { runCommandAction } from "./vscodeCommand";
import { ActionGroupEditorPanel } from "./actionGroupEditor";

var extensionUri: vscode.Uri;
import {
    runProcesses,
    controlRunningProcess,
    sendMessage2RunningProcess,
    killCurrentProcess,
    killAllProcesses,
} from "./process";

// Shows one level of the group structure. While a search term is entered, the
// action groups of all subgroups are searchable as well.
async function pickActionGroupItem(
    members: Array<vscode.QuickPickItem>
): Promise<vscode.QuickPickItem | undefined> {
    const nestedItems = getNestedActionGroupItems(members);
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    quickPick.items = members;
    quickPick.matchOnDescription = true;
    if (nestedItems.length > 0) {
        quickPick.placeholder = "Type to search, including subgroups";
        var showsNestedItems = false;
        quickPick.onDidChangeValue((value) => {
            const showNestedItems = value.length > 0;
            if (showNestedItems !== showsNestedItems) {
                showsNestedItems = showNestedItems;
                quickPick.items = showNestedItems
                    ? [...members, ...nestedItems]
                    : members;
            }
        });
    }

    return new Promise((resolve) => {
        quickPick.onDidAccept(() => {
            resolve(quickPick.selectedItems[0]);
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            resolve(undefined);
            quickPick.dispose();
        });
        quickPick.show();
    });
}

function findReferencedActionGroup(
    commands: Array<vscode.QuickPickItem>,
    reference: ActionGroupReference
): ActionGroup | undefined {
    const matches = findActionGroups(commands, reference);
    const description = reference.groupNames
        ? `"${[...reference.groupNames, reference.name].join(" / ")}"`
        : `"${reference.name}"`;
    if (matches.length === 0) {
        vscode.window.showErrorMessage(
            `Action group ${description} was not found.`
        );
        return undefined;
    }
    if (matches.length > 1) {
        vscode.window.showErrorMessage(
            reference.groupNames
                ? `Several action groups match ${description}.`
                : `Several action groups are named ${description}. Add "groupNames" to the arguments to select one.`
        );
        return undefined;
    }
    return matches[0];
}

// Runs the action group given as argument (e.g. from a keybinding) or lets
// the user pick one.
async function selectAndRunGroup(args?: unknown) {
    console.log(`selectAndRunGroup was triggered.`);
    const commands = getActionGroups();
    if (isActionGroupReference(args)) {
        const command = findReferencedActionGroup(commands, args);
        if (command) {
            await runActionGroup(command);
        }
        return;
    }
    if (commands.length === 0) {
        const createLabel = "Create Action Group";
        const selection = await vscode.window.showInformationMessage(
            "No action groups are configured yet.",
            createLabel
        );
        if (selection === createLabel) {
            ActionGroupEditorPanel.show(extensionUri, true);
        }
        return;
    }
    var command = await pickActionGroupItem(commands);

    while (command instanceof ActionGroupPickGroup) {
        console.log(`Selected group "${command.label}".`);
        command = await pickActionGroupItem(command.getSortedMembers());
    }

    if (command instanceof NestedActionGroupPickItem) {
        command = command.actionGroup;
    }

    if (!(command instanceof ActionGroup)) {
        console.log(`No valid selection was taken.`);
        return;
    }
    await runActionGroup(command);
}

async function runActionGroup(command: ActionGroup) {
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

    const selectedWorkspace = command.selectedWorkspace;
    command.tasks.forEach((task) => runTaskAction(task, selectedWorkspace));

    command.commands.forEach((commandAction) =>
        runCommandAction(commandAction)
    );
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    extensionUri = context.extensionUri;
    const version = context.extension.packageJSON.version as string;
    console.log(`action-group-executer version ${version} is now active.`);
    if (version === "99.99.99") {
        vscode.window.showInformationMessage(
            "Action Group Executer: DEV BUILD loaded"
        );
    }

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
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.createActionGroup",
            () => ActionGroupEditorPanel.show(context.extensionUri, true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "action-group-executer.editActionGroups",
            () => ActionGroupEditorPanel.show(context.extensionUri, false)
        )
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
    // Make sure that no process is running anymore after the windows was closed.
    killAllProcesses();
}

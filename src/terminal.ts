import * as vscode from 'vscode';

import * as utils from "./utils";
import { TerminalAction } from "./configuration";

export function getTerminalName(actionGroupName: string, terminalAction: TerminalAction) {
    // Use the group name as fallback solution.
    let terminalName = actionGroupName;

    // The extended options are the most specific selection.
    if (terminalAction.extendedOptions) {
        if (terminalAction.extendedOptions.name && utils.isNotEmptyString(terminalAction.extendedOptions.name)) {
            return terminalAction.extendedOptions.name;
        }
    }

    // Terminal names are the second choice.
    if (terminalAction.name && utils.isNotEmptyString(terminalAction.name)) {
        return terminalAction.name;
    }

    return terminalName;
}

export function getTerminalWithName(terminalName: string) {
    const terminals = vscode.window.terminals;
    for (let i = 0; i < terminals.length; i++) {
        if (terminals[i].name === terminalName) {
            return terminals[i];
        }
    }
    return null;
}

export function terminalWithNameExists(terminalName: string) {
    const terminal = getTerminalWithName(terminalName);
    return terminal ? terminal : null;
}

export async function createTerminal(terminalName: string, terminalAction: TerminalAction) {
    let terminal;
    if (terminalAction.extendedOptions) {
        // The final name is determined earlier with all settings in mind.
        // At this point the name is set or overridden with the earlier result.
        terminalAction.extendedOptions.name = terminalName;

        terminal = vscode.window.createTerminal(terminalAction.extendedOptions);
    } else {
        terminal = vscode.window.createTerminal(terminalName);
    }

    return terminal;
}

export async function prepareTerminalInst(terminalName: string, terminalAction: TerminalAction) {
    // If there is no terminal yet, we can just create one :D
    if (!terminalWithNameExists(terminalName)) {
        return await createTerminal(terminalName, terminalAction);
    }

    // The following options are based on the assumptions that a terminal with the same name exists.

    if (terminalAction.disposeOldTerminal) {
        let terminal = getTerminalWithName(terminalName);
        terminal?.dispose();
        return await createTerminal(terminalName, terminalAction);
    }

    if (terminalAction.alwaysNewTerminal) {
        let indexCnt = 1;
        while (true) {
            let newName = `${terminalName} (${indexCnt})`;
            indexCnt++;

            if (!terminalWithNameExists(newName)) {
                return await createTerminal(newName, terminalAction);
            }
        }
    }

    return getTerminalWithName(terminalName);
}

export async function runTerminalAction(actionGroupName: string, terminalAction: TerminalAction) {
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

import * as vscode from 'vscode';
import * as utils from "./utils";

export interface TerminalAction {
    // The name in extendedOptions has the highest binding, if not present
    // this setting will be used as the terminal name and afterwards the lowest
    // priority for the name is the ActionGroup name, which is required.
    name?: string;
    // Use the full set of VSCodes terminal options. Will only applied if
    // a new terminal will be created.
    extendedOptions?: vscode.TerminalOptions;
    // Show the terminal, which is pushing it in the front.
    showTerminal?: boolean;
    // Dispose an old terminal having the name and then create a new one
    // with the same name.
    disposeOldTerminal?: boolean;
    // If a terminal with the selected name is already present, create
    // a new terminal with an up counting number behind it.
    alwaysNewTerminal?: boolean;
    // Delay the execution of the command by the given number of milliseconds.
    delayCommand?: number;
    command: string;
}

export interface ActionGroup {
    name: string;
    terminals: Array<TerminalAction>;
}

export function getActionGroups() {
    let commands = vscode.workspace.getConfiguration().get<Array<ActionGroup>>('actionGroupExecuter.actionGroups');

    if (!commands) {
        vscode.window.showWarningMessage('No configuration for ActionGroupExecuter found in settings. Set "actionGroupExecuter.actionGroups" in your settings.');
        return new Array<ActionGroup>();
    }

    // Consider more filtering.
    let filteredCommands = commands.filter(command => utils.isNotEmptyString(command.name));

    return filteredCommands;
}

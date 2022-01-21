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
    // Get the configuration based on the current file.
    const currentFileUri = vscode.window.activeTextEditor?.document.uri;
    console.log(`Using file URI "${currentFileUri}" to determine workspace.`);
    const correspondingWorkspace = currentFileUri ? vscode.workspace.getWorkspaceFolder(currentFileUri) : null;
    console.log(`Using workspace "${correspondingWorkspace?.name}".`);
    const config = vscode.workspace.getConfiguration('actionGroupExecuter', correspondingWorkspace);

    const inspect = config.inspect('actionGroups');

    console.log('---------');
    console.log(`inspect.key: "${inspect?.key}"`);
    console.log(`inspect.defaultValue: "${inspect?.defaultValue}"`);
    console.log(`inspect.globalValue: "${inspect?.globalValue}"`);
    console.log(`inspect.workspaceValue: "${inspect?.workspaceValue}"`);
    console.log(`inspect.workspaceFolderValue: "${inspect?.workspaceFolderValue}"`);
    console.log('---------');

    var mergedCommands = Array();
    mergedCommands = inspect?.defaultValue ? mergedCommands.concat(inspect.defaultValue) : mergedCommands;
    mergedCommands = inspect?.globalValue ? mergedCommands.concat(inspect.globalValue) : mergedCommands;
    mergedCommands = inspect?.workspaceValue ? mergedCommands.concat(inspect.workspaceValue) : mergedCommands;
    mergedCommands = inspect?.workspaceFolderValue ? mergedCommands.concat(inspect.workspaceFolderValue) : mergedCommands;

    const commands = <Array<ActionGroup>>(mergedCommands);

    if (!commands) {
        vscode.window.showWarningMessage('No configuration for ActionGroupExecuter found in settings. Set "actionGroupExecuter.actionGroups" in your settings.');
        return new Array<ActionGroup>();
    }

    // Consider more filtering.
    const filteredCommands = commands.filter(command => utils.isNotEmptyString(command.name));

    return filteredCommands;
}

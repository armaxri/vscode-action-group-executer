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

export interface DebugSession {
    // The name of a debug configuration added to a launch configuration.
    // Mainly used but if not set, a "newConfiguration" is used instead.
    namedConfiguration?: string;
    // Configuration of a launch setting. Will only be used if no name is set.
    newConfiguration?: vscode.DebugConfiguration;
    // Name of the workspace the debug session should be executed in.
    // If none is set, the workspace will be taken from the current opened
    // file. Only useful in a multi root workspace.
    workspaceName?: string;
    // Delay the start of the debug session by the given number of milliseconds.
    delaySession?: number;
}

export interface ActionGroup {
    name: string;
    terminals?: Array<TerminalAction>;
    debugSession?: DebugSession;
    selectedWorkspace?: vscode.WorkspaceFolder | null | undefined;
}

function mergeConfig(config: vscode.WorkspaceConfiguration) {
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

    return <Array<ActionGroup>>(mergedCommands);
}

export function getActionGroups() {
    // Get the configuration based on the current file.
    const correspondingWorkspace = utils.getCurrentWorkspace();
    const config = vscode.workspace.getConfiguration('actionGroupExecuter', correspondingWorkspace);
    const commands = mergeConfig(config);

    if (!commands) {
        vscode.window.showWarningMessage('No configuration for ActionGroupExecuter found in settings. Set "actionGroupExecuter.actionGroups" in your settings.');
        return new Array<ActionGroup>();
    }

    // Attach the workspace that is currently selected, so the context of the calling is known.
    commands.forEach(group =>
        group.selectedWorkspace = correspondingWorkspace
    );

    // Consider more filtering.
    const filteredGroup = commands.filter(command => utils.isNotEmptyString(command.name));

    return filteredGroup;
}

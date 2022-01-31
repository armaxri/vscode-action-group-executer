import * as vscode from 'vscode';
import * as path from 'path';

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

class StringReplacer {
    cwd: string = '';
    fileBasenameNoExtensions: string = '';
    fileBasename: string = '';
    fileDirname: string = '';
    fileExtname: string = '';
    file: string = '';
    lineNumber: string = '';
    pathSeparator: string = '';
    relativeFileDirname: string = '';
    relativeFile: string = '';
    selectedText: string = '';
    workspaceFolderBasename: string = '';
    workspaceFolder: string = '';

    constructor() {
        const editor = vscode.window.activeTextEditor;
        this.cwd = `${process.cwd()}`;

        if (editor?.document) {
            this.fileExtname = path.extname(editor.document.fileName);
            this.fileBasenameNoExtensions = path.basename(editor.document.fileName, this.fileExtname);
            this.fileBasename = path.basename(editor.document.fileName);
            this.fileDirname = path.dirname(editor.document.fileName);
            this.file = editor.document.fileName;

            if (editor?.selection) {
                this.selectedText = editor.document.getText(editor.selection);
            }
        }
        this.lineNumber = `${editor?.selection ? editor?.selection.active.line + 1 : 0}`;
        this.pathSeparator = path.sep;

        const currentWorkspace = utils.getCurrentWorkspace();
        if (currentWorkspace) {
            this.workspaceFolder = currentWorkspace.uri.fsPath;
            this.workspaceFolderBasename = path.basename(this.workspaceFolder);
        }

        this.relativeFile = path.relative(this.workspaceFolder, this.file);
        this.relativeFileDirname = path.relative(this.workspaceFolder, this.fileDirname);

        this.logReplacements();
    }

    public replaceMatches(inputString: string) {
        var resultString = inputString;

        resultString = resultString.replace(/\${cwd}/g, this.cwd);
        resultString = resultString.replace(/\${fileBasenameNoExtensions}/g, this.fileBasenameNoExtensions);
        resultString = resultString.replace(/\${fileBasename}/g, this.fileBasename);
        resultString = resultString.replace(/\${fileDirname}/g, this.fileDirname);
        resultString = resultString.replace(/\${fileExtname}/g, this.fileExtname);
        resultString = resultString.replace(/\${file}/g, this.file);
        resultString = resultString.replace(/\${lineNumber}/g, this.lineNumber);
        resultString = resultString.replace(/\${pathSeparator}/g, this.pathSeparator);
        resultString = resultString.replace(/\${relativeFileDirname}/g, this.relativeFileDirname);
        resultString = resultString.replace(/\${relativeFile}/g, this.relativeFile);
        resultString = resultString.replace(/\${selectedText}/g, this.selectedText);
        resultString = resultString.replace(/\${workspaceFolderBasename}/g, this.workspaceFolderBasename);
        resultString = resultString.replace(/\${workspaceFolder}/g, this.workspaceFolder);

        return resultString;
    }

    private logReplacements() {
        console.log('---------');
        console.log('Replacement strings:');
        console.log(`cwd:                      ${this.cwd}`);
        console.log(`fileBasenameNoExtensions: ${this.fileBasenameNoExtensions}`);
        console.log(`fileBasename:             ${this.fileBasename}`);
        console.log(`fileDirname:              ${this.fileDirname}`);
        console.log(`fileExtname:              ${this.fileExtname}`);
        console.log(`file:                     ${this.file}`);
        console.log(`lineNumber:               ${this.lineNumber}`);
        console.log(`pathSeparator:            ${this.pathSeparator}`);
        console.log(`relativeFileDirname:      ${this.relativeFileDirname}`);
        console.log(`relativeFile:             ${this.relativeFile}`);
        console.log(`selectedText:             ${this.selectedText}`);
        console.log(`workspaceFolderBasename:  ${this.workspaceFolderBasename}`);
        console.log(`workspaceFolder:          ${this.workspaceFolder}`);
        console.log('---------');
    }
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

function applyReplacementsInGroups(actionGroups: Array<ActionGroup>) {
    const replacer = new StringReplacer();

    actionGroups.forEach(actionGroup =>
        actionGroup.terminals?.forEach(terminalAction =>
            terminalAction.command = replacer.replaceMatches(terminalAction.command)
        )
    );

    return actionGroups;
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
    const filteredGroups = commands.filter(command => utils.isNotEmptyString(command.name));

    const adjustedGroups = applyReplacementsInGroups(filteredGroups);

    return adjustedGroups;
}

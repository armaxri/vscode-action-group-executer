import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';

import * as utils from "./utils";

export interface TerminalAction {
    name?: string;
    extendedOptions?: vscode.TerminalOptions;
    showTerminal?: boolean;
    disposeOldTerminal?: boolean;
    alwaysNewTerminal?: boolean;
    delayCommand?: number;
    command: string;
}

export interface ProcessCommand {
    call: Array<string>;
    delayProcess?: number;
    extendedOptions: child_process.SpawnOptionsWithoutStdio;
    processEndMessage?: string;
    hideProcessEndMessage?: boolean;
}

export interface ProcessAction {
    command?: ProcessCommand;
    commands?: Array<ProcessCommand>;
}

export interface DebugSession {
    namedConfiguration?: string;
    newConfiguration?: vscode.DebugConfiguration;
    workspaceName?: string;
    delaySession?: number;
}

export interface ActionGroup {
    name: string;
    terminals?: Array<TerminalAction>;
    debugSession?: DebugSession;
    selectedWorkspace?: vscode.WorkspaceFolder | null | undefined;
    processes?: Array<ProcessAction>;
    defaultProcessEndMessage?: string;
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

        resultString = resultString.replace(/\${env\:([^}]+)}/g, function(substring, envName) {
            const envVariable = process.env[envName];
            return envVariable ? envVariable : '';
        });

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

    var mergedCommands = Array<ActionGroup>();

    function createAndAddGroups(configValue: any) {
        if (Array.isArray(configValue)) {
            configValue.forEach(group => {
                const castedGroup = <ActionGroup>group;
                mergedCommands.push(castedGroup);
            });
        }
    }

    createAndAddGroups(inspect?.defaultValue);
    createAndAddGroups(inspect?.globalValue);
    createAndAddGroups(inspect?.workspaceValue);

    // If we have no workspace file, the content of the workspaceValue will equal the workspaceFolderValue.
    // In that case we get all declarations doubled, that is actually not cool :/
    // The settings of the workspaceFolderValue are determined by the currently selected file. So we pick
    // workspaceValue over it, because you can have any file open and still get the setting. The other
    // way around would mean that you won't get any group if a radom file outside the workspace is selected.
    if (vscode.workspace.workspaceFile) {
        createAndAddGroups(inspect?.workspaceFolderValue);
    }

    return <Array<ActionGroup>>(mergedCommands);
}

function applyReplacementsInGroups(actionGroups: Array<ActionGroup>, defaultProcessEndMessage: string | undefined) {
    if (defaultProcessEndMessage) {
        actionGroups.forEach(group => {
            group.processes?.forEach(process => {
                if (process.command) {
                    if (!process.command.processEndMessage) {
                        process.command.processEndMessage = defaultProcessEndMessage;
                    }
                }
                process.commands?.forEach(command => {
                    if (!command.processEndMessage) {
                        command.processEndMessage = defaultProcessEndMessage;
                    }
                });
            });
        });
    }

    const replacer = new StringReplacer();

    utils.replaceAllStrings(actionGroups, currentString => {
        return replacer.replaceMatches(currentString);
    });

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

    // Consider more filtering.
    const filteredGroups = commands.filter(command => utils.isNotEmptyString(command.name));

    // Apply adjustments before adding the corresponding workspace, so the strings in the object
    // will not be touched be recursive object analysis.
    const adjustedGroups = applyReplacementsInGroups(filteredGroups, config.get<string>('defaultProcessEndMessage'));

    // Attach the workspace that is currently selected, so the context of the calling is known.
    adjustedGroups.forEach(group => {
        group.selectedWorkspace = correspondingWorkspace;
    });

    return adjustedGroups;
}

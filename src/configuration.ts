import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";

import * as utils from "./utils";

export interface EITerminalAction {
    name?: string;
    extendedOptions?: vscode.TerminalOptions;
    showTerminal?: boolean;
    disposeOldTerminal?: boolean;
    alwaysNewTerminal?: boolean;
    delayCommand?: number;
    command: string;
    useProcessDefaultDebugConfig?: boolean;
    debugTemplate?: vscode.DebugConfiguration;
}

export interface EIProcessCommand {
    call: Array<string>;
    requestUserInputArguments?: boolean;
    delayProcess?: number;
    extendedOptions: child_process.SpawnOptionsWithoutStdio;
    processEndMessage?: string;
    hideProcessEndMessage?: boolean;
    debugTemplate?: vscode.DebugConfiguration;
}

export interface EIProcessAction {
    name?: string;
    printName?: boolean;
    printCommand?: boolean;
    command?: EIProcessCommand;
    commands?: Array<EIProcessCommand>;
    fileAssociation?: string;
}

export interface EIDebugSession {
    namedConfiguration?: string;
    newConfiguration?: vscode.DebugConfiguration;
    requestUserInputArguments?: boolean;
    workspaceName?: string;
    delaySession?: number;
}

export interface EIGroupNames {
    name: string;
    sortingIndex?: number;
}

export interface EIActionGroup {
    name: string;
    groupNames?: Array<EIGroupNames>;
    sortingIndex?: number;
    terminals?: Array<EITerminalAction>;
    debugSession?: EIDebugSession;
    processes?: Array<EIProcessAction>;
    defaultProcessDebugTemplate?: vscode.DebugConfiguration;
}

export class TerminalAction {
    name: string;
    extendedOptions?: vscode.TerminalOptions;
    showTerminal: boolean = true;
    disposeOldTerminal: boolean = false;
    alwaysNewTerminal: boolean = false;
    delayCommand: number = 0;
    command: string;
    debugTemplate?: vscode.DebugConfiguration;

    constructor(
        config: EITerminalAction,
        groupName: string,
        defaultProcessDebugTemplate: vscode.DebugConfiguration | undefined
    ) {
        if (config?.extendedOptions && config?.extendedOptions.name) {
            this.name = config.extendedOptions.name;
        } else {
            this.name = config.name ? config.name : groupName;
        }

        if (config.extendedOptions) {
            this.extendedOptions = config.extendedOptions;
        }

        this.showTerminal =
            typeof config.showTerminal === "boolean"
                ? config.showTerminal
                : this.showTerminal;
        this.disposeOldTerminal =
            typeof config.disposeOldTerminal === "boolean"
                ? config.disposeOldTerminal
                : this.disposeOldTerminal;
        this.alwaysNewTerminal =
            typeof config.alwaysNewTerminal === "boolean"
                ? config.alwaysNewTerminal
                : this.alwaysNewTerminal;
        this.delayCommand =
            typeof config.delayCommand === "number"
                ? config.delayCommand
                : this.delayCommand;

        this.command = config.command;

        if (config?.debugTemplate) {
            this.debugTemplate = config.debugTemplate;
        } else {
            if (
                config?.useProcessDefaultDebugConfig &&
                config.useProcessDefaultDebugConfig &&
                typeof defaultProcessDebugTemplate !== "undefined"
            ) {
                this.debugTemplate = defaultProcessDebugTemplate;
            }
        }
    }

    public isConvertible2Debug(): boolean {
        // A debug template is required and we only support it when one command is present.
        // Otherwise the handling of multiple processes will get to complicated.
        return typeof this.debugTemplate !== "undefined";
    }

    public convert2DebugSession() {
        if (!this.debugTemplate) {
            console.log(
                `Tried to convert a process to a debug session without template.`
            );
            return;
        }
        this.debugTemplate.name = this.name;
        const debugSession = new DebugSession(undefined, this.debugTemplate);

        if (debugSession.newConfiguration) {
            var splittedCommand = utils.splitArguments(this.command);
            debugSession.newConfiguration.program = splittedCommand[0];
            debugSession.newConfiguration.args = splittedCommand.slice(1);
            if (this?.extendedOptions && this.extendedOptions?.cwd) {
                debugSession.newConfiguration.cwd = this.extendedOptions.cwd;
            }
        }
        debugSession.delaySession = this.delayCommand;

        return debugSession;
    }
}

export class ProcessCommand {
    program: string;
    args: Array<string>;
    requestUserInputArguments: boolean = false;
    extendedOptions: child_process.SpawnOptionsWithoutStdio;
    delayProcess: number = 0;
    processEndMessage: string;
    hideProcessEndMessage: boolean = false;

    constructor(config: EIProcessCommand, defaultProcessEndMessage: string) {
        this.program = config.call[0];
        this.args = config.call.slice(1);
        this.requestUserInputArguments =
            typeof config.requestUserInputArguments === "boolean"
                ? config.requestUserInputArguments
                : this.requestUserInputArguments;

        this.extendedOptions = config.extendedOptions;

        this.delayProcess =
            typeof config.delayProcess === "number"
                ? config.delayProcess
                : this.delayProcess;
        this.hideProcessEndMessage =
            typeof config.hideProcessEndMessage === "boolean"
                ? config.hideProcessEndMessage
                : this.hideProcessEndMessage;

        if (config.processEndMessage) {
            this.processEndMessage = config.processEndMessage;
        } else {
            this.processEndMessage = defaultProcessEndMessage;
        }
    }

    public convert2DebugSession(debugSession: DebugSession) {
        if (debugSession.newConfiguration) {
            debugSession.newConfiguration.program = this.program;
            debugSession.newConfiguration.args = this.args;
            if (this.extendedOptions.cwd) {
                debugSession.newConfiguration.cwd = this.extendedOptions.cwd;
            }
        }
        debugSession.requestUserInputArguments = this.requestUserInputArguments;
        debugSession.delaySession = this.delayProcess;

        return debugSession;
    }
}

export class ProcessAction {
    name: string;
    printName: boolean = false;
    printCommand: boolean = false;
    commands: Array<ProcessCommand> = new Array<ProcessCommand>();
    processDebugTemplate?: vscode.DebugConfiguration;
    fileAssociationType: string;

    constructor(
        config: EIProcessAction,
        defaultProcessEndMessage: string,
        defaultFileAssociation: string,
        groupName: string,
        defaultProcessDebugTemplate: vscode.DebugConfiguration | undefined
    ) {
        this.name = config.name ? config.name : groupName;
        if (typeof config.printName === "boolean") {
            this.printName = config.printName;
        } else {
            // Allow a shortcut for display by simply writing the name.
            this.printName = typeof config.name === "string";
        }
        this.printCommand =
            typeof config.printCommand === "boolean"
                ? config.printCommand
                : this.printCommand;

        if (config.command) {
            this.commands.push(
                new ProcessCommand(config.command, defaultProcessEndMessage)
            );
        } else {
            config.commands?.forEach((command) => {
                const newCommand = new ProcessCommand(
                    command,
                    defaultProcessEndMessage
                );
                this.commands.push(newCommand);
            });
        }

        if (config.command?.debugTemplate) {
            this.processDebugTemplate = config.command.debugTemplate;
        } else {
            if (typeof defaultProcessDebugTemplate !== "undefined") {
                this.processDebugTemplate = defaultProcessDebugTemplate;
            }
        }

        this.fileAssociationType = config.fileAssociation
            ? config.fileAssociation
            : defaultFileAssociation;
    }

    public isConvertible2Debug(): boolean {
        // A debug template is required and we only support it when one command is present.
        // Otherwise the handling of multiple processes will get to complicated.
        return (
            typeof this.processDebugTemplate !== "undefined" &&
            this.commands.length === 1
        );
    }

    public convert2DebugSession() {
        if (!this.processDebugTemplate) {
            console.log(
                `Tried to convert a process to a debug session without template.`
            );
            return;
        }
        this.processDebugTemplate.name = this.name;
        const debugSession = new DebugSession(
            undefined,
            this.processDebugTemplate
        );
        return this.commands[0].convert2DebugSession(debugSession);
    }
}

export class DebugSession {
    namedConfiguration: string | undefined;
    newConfiguration: vscode.DebugConfiguration | undefined;
    requestUserInputArguments: boolean = false;
    workspaceName: string | undefined;
    delaySession: number = 0;

    constructor(
        config: EIDebugSession | undefined,
        debugTemplate: vscode.DebugConfiguration | undefined
    ) {
        if (typeof config !== "undefined") {
            this.namedConfiguration = config.namedConfiguration;
            this.newConfiguration = config.newConfiguration;
            this.requestUserInputArguments =
                typeof config.requestUserInputArguments === "boolean"
                    ? config.requestUserInputArguments
                    : this.requestUserInputArguments;
            this.workspaceName = config.workspaceName;
            this.delaySession =
                typeof config.delaySession === "number"
                    ? config.delaySession
                    : this.delaySession;
        } else {
            if (typeof debugTemplate !== "undefined") {
                this.newConfiguration = debugTemplate;
            }
        }
    }
}

enum GroupSource {
    default = "Default Settings",
    user = "User Settings",
    workspace = "Workspace Settings",
    workspaceFolder = "Workspace Folder Settings",
}

export class GroupName {
    name: string;
    sortingIndex: number;

    constructor(name: string, sortingIndex: number | undefined) {
        this.name = name;
        this.sortingIndex = sortingIndex ? sortingIndex : 9999999;
    }
}

class SortableQuickPickItem implements vscode.QuickPickItem {
    label: string;
    sortingIndex: number = 9999999;

    constructor(label: string, sortingIndex: number | undefined) {
        this.label = label;

        if (sortingIndex) {
            this.sortingIndex = sortingIndex;
        }
    }
}

export class ActionGroup extends SortableQuickPickItem {
    name: string;
    groupNames: Array<GroupName> = new Array<GroupName>();
    terminals: Array<TerminalAction> = new Array<TerminalAction>();
    debugSession?: DebugSession;
    selectedWorkspace: vscode.WorkspaceFolder | null | undefined = null;
    processes: Array<ProcessAction> = new Array<ProcessAction>();

    constructor(
        config: EIActionGroup,
        defaultProcessEndMessage: string | undefined,
        defaultFileAssociation: string | undefined,
        defaultShowActionSource: boolean | undefined,
        settingsSource: GroupSource
    ) {
        super(
            defaultShowActionSource
                ? config.name + " (" + settingsSource + ")"
                : config.name,
            config.sortingIndex
        );
        this.name = config.name;

        const defaultProcessEndMessageAdj = defaultProcessEndMessage ?? "";
        const defaultFileAssociationAdj = defaultFileAssociation ?? "";

        config.groupNames?.forEach((groupName) => {
            this.groupNames.push(
                new GroupName(
                    groupName.name,
                    groupName.sortingIndex ? groupName.sortingIndex : 9999999
                )
            );
        });
        config.terminals?.forEach((terminalAction) => {
            const newTerminalAction = new TerminalAction(
                terminalAction,
                this.name,
                config.defaultProcessDebugTemplate
            );
            this.terminals.push(newTerminalAction);
        });
        config.processes?.forEach((processAction) => {
            const newProcessAction = new ProcessAction(
                processAction,
                defaultProcessEndMessageAdj,
                defaultFileAssociationAdj,
                this.name,
                config.defaultProcessDebugTemplate
            );
            this.processes.push(newProcessAction);
        });
        if (config.debugSession) {
            // Simple cast for the moment. Add class functionality later.
            this.debugSession = new DebugSession(
                config.debugSession,
                undefined
            );
        }
    }

    public async check4ProcessDebugging(): Promise<boolean> {
        if (this.debugSession) {
            // If there is already a debug session set, a process can't be debugged.
            return false;
        }
        const processes2Debug = new Array<string>();
        const startString = "Debug: ";
        const noDebugName = startString + "No debugging";
        processes2Debug.push(noDebugName);

        this.processes.forEach((process) => {
            if (process.isConvertible2Debug()) {
                processes2Debug.push(startString + process.name);
            }
        });
        this.terminals.forEach((terminal) => {
            if (terminal.isConvertible2Debug()) {
                processes2Debug.push(startString + terminal.name);
            }
        });

        if (processes2Debug.length <= 1) {
            // No processes that allow debugging.
            return false;
        }

        var selection = await vscode.window.showQuickPick(processes2Debug);

        if (!selection) {
            // Nothing selected, so trigger abort of all actions.
            return true;
        }

        if (selection === noDebugName) {
            // No debugging selected.
            return false;
        }

        // Remove the start string.
        selection = selection.replace(startString, "");

        const process2Debug = this.processes.find(
            (process) => process.name === selection
        );
        if (process2Debug) {
            this.debugSession = process2Debug.convert2DebugSession();
            this.processes = this.processes.filter(
                (obj) => obj !== process2Debug
            );
        }
        const terminal2Debug = this.terminals.find(
            (process) => process.name === selection
        );
        if (terminal2Debug) {
            this.debugSession = terminal2Debug.convert2DebugSession();
            this.terminals = this.terminals.filter(
                (obj) => obj !== terminal2Debug
            );
        }

        return false;
    }
}

export class ActionGroupPickGroup extends SortableQuickPickItem {
    groups: Array<ActionGroupPickGroup> = new Array<ActionGroupPickGroup>();
    elements: Array<ActionGroup> = new Array<ActionGroup>();

    constructor(config: GroupName) {
        super(config.name, config.sortingIndex);
    }

    public recursivelyAddAction(action: ActionGroup) {
        if (action.groupNames.length > 0) {
            const groupName = action.groupNames.shift();
            if (!groupName) {
                this.elements.push(action);
                return;
            }

            // Smallest index wins.
            this.sortingIndex =
                groupName.sortingIndex < this.sortingIndex
                    ? groupName.sortingIndex
                    : this.sortingIndex;

            if (action.groupNames.length > 0) {
                const group = this.groups.find(
                    (group) => group.label === groupName.name
                );

                if (group) {
                    group.recursivelyAddAction(action);
                } else {
                    const newGroup = new ActionGroupPickGroup(
                        action.groupNames[0]
                    );
                    newGroup.recursivelyAddAction(action);
                    this.groups.push(newGroup);
                }
            } else {
                this.elements.push(action);
            }
        } else {
            this.elements.push(action);
        }
    }

    getSortedMembers(): Array<SortableQuickPickItem> {
        const allMembers = new Array<SortableQuickPickItem>();
        this.groups.forEach((group) => {
            allMembers.push(group);
        });
        this.elements.forEach((element) => {
            allMembers.push(element);
        });

        return sortGroupsRecursivelyByIndex(allMembers);
    }
}

class StringReplacer {
    cwd: string = "";
    fileBasenameNoExtensions: string = "";
    fileBasename: string = "";
    fileDirname: string = "";
    fileExtname: string = "";
    file: string = "";
    lineNumber: string = "";
    pathSeparator: string = "";
    relativeFileDirname: string = "";
    relativeFile: string = "";
    selectedText: string = "";
    workspaceFolderBasename: string = "";
    workspaceFolder: string = "";

    constructor() {
        const editor = vscode.window.activeTextEditor;
        this.cwd = `${process.cwd()}`;

        if (editor?.document) {
            this.fileExtname = path.extname(editor.document.fileName);
            this.fileBasenameNoExtensions = path.basename(
                editor.document.fileName,
                this.fileExtname
            );
            this.fileBasename = path.basename(editor.document.fileName);
            this.fileDirname = path.dirname(editor.document.fileName);
            this.file = editor.document.fileName;

            if (editor?.selection) {
                this.selectedText = editor.document.getText(editor.selection);
            }
        }
        this.lineNumber = `${
            editor?.selection ? editor?.selection.active.line + 1 : 0
        }`;
        this.pathSeparator = path.sep;

        const currentWorkspace = utils.getCurrentWorkspace();
        if (currentWorkspace) {
            this.workspaceFolder = currentWorkspace.uri.fsPath;
            this.workspaceFolderBasename = path.basename(this.workspaceFolder);
        }

        this.relativeFile = path.relative(this.workspaceFolder, this.file);
        this.relativeFileDirname = path.relative(
            this.workspaceFolder,
            this.fileDirname
        );

        this.logReplacements();
    }

    public replaceMatches(inputString: string) {
        var resultString = inputString;

        resultString = resultString.replace(/\${cwd}/g, this.cwd);
        resultString = resultString.replace(
            /\${fileBasenameNoExtensions}/g,
            this.fileBasenameNoExtensions
        );
        resultString = resultString.replace(
            /\${fileBasename}/g,
            this.fileBasename
        );
        resultString = resultString.replace(
            /\${fileDirname}/g,
            this.fileDirname
        );
        resultString = resultString.replace(
            /\${fileExtname}/g,
            this.fileExtname
        );
        resultString = resultString.replace(/\${file}/g, this.file);
        resultString = resultString.replace(/\${lineNumber}/g, this.lineNumber);
        resultString = resultString.replace(
            /\${pathSeparator}/g,
            this.pathSeparator
        );
        resultString = resultString.replace(
            /\${relativeFileDirname}/g,
            this.relativeFileDirname
        );
        resultString = resultString.replace(
            /\${relativeFile}/g,
            this.relativeFile
        );
        resultString = resultString.replace(
            /\${selectedText}/g,
            this.selectedText
        );
        resultString = resultString.replace(
            /\${workspaceFolderBasename}/g,
            this.workspaceFolderBasename
        );
        resultString = resultString.replace(
            /\${workspaceFolder}/g,
            this.workspaceFolder
        );

        resultString = resultString.replace(
            /\${env\:([^}]+)}/g,
            function (substring, envName) {
                const envVariable = process.env[envName];
                return envVariable ? envVariable : "";
            }
        );

        return resultString;
    }

    private logReplacements() {
        console.log("---------");
        console.log("Replacement strings:");
        console.log(`cwd:                      ${this.cwd}`);
        console.log(
            `fileBasenameNoExtensions: ${this.fileBasenameNoExtensions}`
        );
        console.log(`fileBasename:             ${this.fileBasename}`);
        console.log(`fileDirname:              ${this.fileDirname}`);
        console.log(`fileExtname:              ${this.fileExtname}`);
        console.log(`file:                     ${this.file}`);
        console.log(`lineNumber:               ${this.lineNumber}`);
        console.log(`pathSeparator:            ${this.pathSeparator}`);
        console.log(`relativeFileDirname:      ${this.relativeFileDirname}`);
        console.log(`relativeFile:             ${this.relativeFile}`);
        console.log(`selectedText:             ${this.selectedText}`);
        console.log(
            `workspaceFolderBasename:  ${this.workspaceFolderBasename}`
        );
        console.log(`workspaceFolder:          ${this.workspaceFolder}`);
        console.log("---------");
    }
}

function createAndMergeGroups(
    config: vscode.WorkspaceConfiguration,
    defaultProcessEndMessage: string | undefined,
    defaultFileAssociation: string | undefined,
    defaultShowActionSource: boolean | undefined
) {
    const inspect = config.inspect("actionGroups");

    console.log("---------");
    console.log(`inspect.key: "${inspect?.key}"`);
    console.log(`inspect.defaultValue: "${inspect?.defaultValue}"`);
    console.log(`inspect.globalValue: "${inspect?.globalValue}"`);
    console.log(`inspect.workspaceValue: "${inspect?.workspaceValue}"`);
    console.log(
        `inspect.workspaceFolderValue: "${inspect?.workspaceFolderValue}"`
    );
    console.log("---------");

    var mergedCommands = Array<ActionGroup>();

    function createAndAddGroups(configValue: any, source: GroupSource) {
        if (Array.isArray(configValue)) {
            configValue.forEach((group) => {
                const castedGroup = <EIActionGroup>group;
                const newGroup = new ActionGroup(
                    castedGroup,
                    defaultProcessEndMessage,
                    defaultFileAssociation,
                    defaultShowActionSource,
                    source
                );
                mergedCommands.push(newGroup);
            });
        }
    }

    createAndAddGroups(inspect?.defaultValue, GroupSource.default);
    createAndAddGroups(inspect?.globalValue, GroupSource.user);
    createAndAddGroups(inspect?.workspaceValue, GroupSource.workspace);

    // If we have no workspace file, the content of the workspaceValue will equal the workspaceFolderValue.
    // In that case we get all declarations doubled, that is actually not cool :/
    // The settings of the workspaceFolderValue are determined by the currently selected file. So we pick
    // workspaceValue over it, because you can have any file open and still get the setting. The other
    // way around would mean that you won't get any group if a random file outside the workspace is selected.
    if (vscode.workspace.workspaceFile) {
        createAndAddGroups(
            inspect?.workspaceFolderValue,
            GroupSource.workspaceFolder
        );
    }

    return <Array<ActionGroup>>mergedCommands;
}

function applyReplacementsInGroups(actionGroups: Array<ActionGroup>) {
    const replacer = new StringReplacer();

    utils.replaceAllStrings(actionGroups, (currentString) => {
        return replacer.replaceMatches(currentString);
    });

    return actionGroups;
}

function createGroupStructure(
    actionGroups: Array<ActionGroup>
): Array<SortableQuickPickItem> {
    const singleElements = new Array<ActionGroup>();
    const groups = new Array<ActionGroupPickGroup>();

    actionGroups.forEach((actionGroup) => {
        if (actionGroup.groupNames.length > 0) {
            const groupName = actionGroup.groupNames[0];
            const group = groups.find(
                (group) => group.label === groupName.name
            );

            if (group) {
                group.recursivelyAddAction(actionGroup);
            } else {
                const newGroup = new ActionGroupPickGroup(groupName);
                newGroup.recursivelyAddAction(actionGroup);
                groups.push(newGroup);
            }
        } else {
            singleElements.push(actionGroup);
        }
    });

    const allElements = new Array<SortableQuickPickItem>();
    groups.forEach((group) => {
        allElements.push(group);
    });
    singleElements.forEach((element) => {
        allElements.push(element);
    });

    return allElements;
}

function sortGroupsRecursivelyByIndex(
    sortableQuickPickItem: Array<SortableQuickPickItem>
): Array<SortableQuickPickItem> {
    sortableQuickPickItem.forEach((item) => {
        if (item instanceof ActionGroupPickGroup) {
            sortGroupsRecursivelyByIndex(item.groups);
        }
    });

    sortableQuickPickItem.sort((a, b) =>
        a.sortingIndex > b.sortingIndex
            ? 1
            : b.sortingIndex > a.sortingIndex
            ? -1
            : 0
    );

    return sortableQuickPickItem;
}

export function getActionGroups() {
    // Get the configuration based on the current file.
    const correspondingWorkspace = utils.getCurrentWorkspace();
    const config = vscode.workspace.getConfiguration(
        "actionGroupExecuter",
        correspondingWorkspace
    );
    const commands = createAndMergeGroups(
        config,
        config.get<string>("defaultProcessEndMessage"),
        config.get<string>("defaultFileAssociation"),
        config.get<boolean>("defaultShowActionSource")
    );

    if (!commands) {
        vscode.window.showWarningMessage(
            'No configuration for ActionGroupExecuter found in settings. Set "actionGroupExecuter.actionGroups" in your settings.'
        );
        return new Array<ActionGroup>();
    }

    // Consider more filtering.
    const filteredGroups = commands.filter((command) =>
        utils.isNotEmptyString(command.name)
    );

    // Apply adjustments before adding the corresponding workspace, so the strings in the object
    // will not be touched be recursive object analysis.
    var adjustedGroups = applyReplacementsInGroups(filteredGroups);

    // Attach the workspace that is currently selected, so the context of the calling is known.
    adjustedGroups.forEach((group) => {
        group.selectedWorkspace = correspondingWorkspace;
    });

    // Group the commands based on the configuration in directories.
    var groupedCommands = createGroupStructure(adjustedGroups);

    // Order the action groups recursively based on the sorting index.
    sortGroupsRecursivelyByIndex(groupedCommands);

    return groupedCommands;
}

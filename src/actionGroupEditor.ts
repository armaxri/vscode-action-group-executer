import * as vscode from "vscode";

import { EIActionGroup } from "./configuration";
import {
    addActionGroup,
    cloneJson,
    deleteActionGroup,
    folderPathText,
    getKnownFolderPaths,
    getSettingsTargets,
    getVerifiedGroups,
    groupNamesFromPath,
    replaceActionGroup,
    SettingsTarget,
    StoredActionGroup,
} from "./actionGroupSettings";
import {
    CommandChoice,
    DeleteRequest,
    EditorResult,
    EditorState,
    ExtensionMessage,
    LaunchChoice,
    SaveRequest,
    TaskChoice,
    WebviewMessage,
} from "./actionGroupEditorProtocol";
import { joinArguments, splitArguments } from "./utils";
import { getContributedCommands } from "./vscodeCommand";

function getTaskFolder(task: vscode.Task) {
    const scope = task.scope;
    if (typeof scope === "object" && scope !== null && "uri" in scope) {
        return scope as vscode.WorkspaceFolder;
    }
    return undefined;
}

async function getTaskChoices() {
    const choices = new Array<TaskChoice>();
    const seen = new Set<string>();
    (await vscode.tasks.fetchTasks()).forEach((task) => {
        const choice = {
            name: task.name,
            source: task.source,
            folder: getTaskFolder(task)?.name,
        };
        const key = JSON.stringify(choice);
        if (!seen.has(key)) {
            seen.add(key);
            choices.push(choice);
        }
    });
    return choices.sort((a, b) => a.name.localeCompare(b.name));
}

async function getCommandChoices() {
    const titles = getContributedCommands();
    const ids = new Set([
        ...(await vscode.commands.getCommands(true)),
        ...titles.keys(),
    ]);
    const choices: Array<CommandChoice> = [...ids].map((id) => ({
        id: id,
        title: titles.get(id),
    }));
    // Commands with a title first, they are the ones users know.
    return choices.sort((a, b) =>
        a.title && b.title
            ? a.title.localeCompare(b.title)
            : a.title
            ? -1
            : b.title
            ? 1
            : a.id.localeCompare(b.id)
    );
}

function getLaunchChoices() {
    const choices = new Array<LaunchChoice>();
    const multiRoot = !!vscode.workspace.workspaceFile;

    function addChoices(
        launch: vscode.WorkspaceConfiguration,
        level: "workspaceFolderValue" | "workspaceValue" | "globalValue",
        location: string,
        folder: vscode.WorkspaceFolder | undefined
    ) {
        const configurations = launch.inspect("configurations")?.[level];
        const compounds = launch.inspect("compounds")?.[level];
        if (Array.isArray(configurations)) {
            configurations.forEach((configuration) => {
                if (typeof configuration?.name === "string") {
                    choices.push({
                        name: configuration.name,
                        folder: folder?.name,
                        location: location,
                        detail: [configuration.type, configuration.request]
                            .filter((part) => part)
                            .join(" · "),
                    });
                }
            });
        }
        if (Array.isArray(compounds)) {
            compounds.forEach((compound) => {
                if (typeof compound?.name === "string") {
                    choices.push({
                        name: compound.name,
                        folder: folder?.name,
                        location: location,
                        detail: "compound",
                    });
                }
            });
        }
    }

    vscode.workspace.workspaceFolders?.forEach((folder) =>
        addChoices(
            vscode.workspace.getConfiguration("launch", folder.uri),
            "workspaceFolderValue",
            folder.name,
            folder
        )
    );
    const launch = vscode.workspace.getConfiguration("launch");
    // Without a workspace file the workspace settings equal the folder settings.
    if (multiRoot) {
        addChoices(launch, "workspaceValue", "Workspace", undefined);
    }
    addChoices(launch, "globalValue", "User", undefined);
    return choices;
}

export function countActions(group: EIActionGroup) {
    return (
        (group.tasks?.length ?? 0) +
        (group.commands?.length ?? 0) +
        (group.terminals?.length ?? 0) +
        (group.processes?.length ?? 0) +
        (group.debugSession ? 1 : 0)
    );
}

function validateGroup(
    group: EIActionGroup,
    processLines: Array<string | null>
): string | undefined {
    if (!group.name || group.name.trim() === "") {
        return "The action group needs a name.";
    }
    if (countActions(group) === 0) {
        return "Add at least one action.";
    }
    if (group.tasks?.some((task) => !task.name)) {
        return "Select a task for every task entry.";
    }
    if (group.commands?.some((command) => !command.id?.trim())) {
        return "Enter a command for every command entry.";
    }
    if (
        group.commands?.some(
            (command) =>
                command.args !== undefined && !Array.isArray(command.args)
        )
    ) {
        return "Command arguments must be a JSON array.";
    }
    if (group.terminals?.some((terminal) => !terminal.command?.trim())) {
        return "Enter a command for every terminal.";
    }
    if (
        processLines.some(
            (line) => line !== null && splitArguments(line).length === 0
        )
    ) {
        return "Enter a command line for every process.";
    }
    const debugSession = group.debugSession;
    if (
        debugSession &&
        !debugSession.namedConfiguration &&
        !debugSession.newConfiguration
    ) {
        return "Select a launch configuration for the debug session.";
    }
    return undefined;
}

const actionListKeys = ["tasks", "commands", "terminals", "processes"] as const;

// All logic of the editor, independent of the webview so it can be tested directly.
export class ActionGroupEditorController {
    private confirm: (message: string, confirmLabel: string) => Promise<boolean>;

    constructor(
        confirm: (message: string, confirmLabel: string) => Promise<boolean>
    ) {
        this.confirm = confirm;
    }

    private findTarget(targetId: string) {
        const target = getSettingsTargets().find(
            (target) => target.id === targetId
        );
        if (!target) {
            throw new Error("The selected settings location is not available.");
        }
        return target;
    }

    private findStoredGroup(id: string, original: EIActionGroup | undefined) {
        const separator = id.lastIndexOf("#");
        const target = this.findTarget(id.slice(0, separator));
        const index = parseInt(id.slice(separator + 1), 10);
        if (!original || isNaN(index)) {
            throw new Error("The action group to change is unknown.");
        }
        return new StoredActionGroup(target, index, original);
    }

    private static groupId(target: SettingsTarget, index: number) {
        return `${target.id}#${index}`;
    }

    public async getState(): Promise<EditorState> {
        const targets = getSettingsTargets();
        return {
            targets: targets.map((target) => ({
                id: target.id,
                label: target.label,
            })),
            groups: targets.flatMap((target) =>
                target.readGroups().map((config, index) => ({
                    id: ActionGroupEditorController.groupId(target, index),
                    targetId: target.id,
                    config: config,
                    folderPath: folderPathText(config.groupNames),
                    processLines: (config.processes ?? []).map((process) =>
                        process.command
                            ? joinArguments(process.command.call ?? [])
                            : null
                    ),
                }))
            ),
            choices: {
                tasks: await getTaskChoices(),
                commands: await getCommandChoices(),
                launches: getLaunchChoices(),
                folderPaths: getKnownFolderPaths(),
                multiRoot: !!vscode.workspace.workspaceFile,
            },
        };
    }

    public async save(request: SaveRequest): Promise<EditorResult> {
        try {
            const group = cloneJson(request.config);
            const error = validateGroup(group, request.processLines);
            if (error) {
                return { ok: false, error: error };
            }
            group.name = group.name.trim();

            const groupNames = groupNamesFromPath(request.folderPath);
            const originalNames = request.original?.groupNames;
            if (
                originalNames &&
                folderPathText(originalNames) === folderPathText(groupNames)
            ) {
                // Unchanged folder, keep the stored entries as they are.
                group.groupNames = originalNames;
            } else if (groupNames.length > 0) {
                group.groupNames = groupNames;
            } else {
                delete group.groupNames;
            }

            request.processLines.forEach((line, index) => {
                const process = group.processes?.[index];
                if (line !== null && process) {
                    process.command = {
                        ...process.command!,
                        call: splitArguments(line),
                    };
                }
            });
            actionListKeys.forEach((key) => {
                if (group[key]?.length === 0) {
                    delete group[key];
                }
            });

            const target = this.findTarget(request.targetId);
            if (!request.id) {
                await addActionGroup(target, group);
                return {
                    ok: true,
                    select: ActionGroupEditorController.groupId(
                        target,
                        target.readGroups().length - 1
                    ),
                };
            }

            const storedGroup = this.findStoredGroup(
                request.id,
                request.original
            );
            if (storedGroup.target.id === target.id) {
                await replaceActionGroup(storedGroup, group);
                return { ok: true, select: request.id };
            }
            // Moved to another settings location: add first, so nothing is lost on errors.
            getVerifiedGroups(storedGroup);
            await addActionGroup(target, group);
            const newIndex = target.readGroups().length - 1;
            await deleteActionGroup(storedGroup);
            return {
                ok: true,
                select: ActionGroupEditorController.groupId(target, newIndex),
            };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : `${error}`,
            };
        }
    }

    public async delete(request: DeleteRequest): Promise<EditorResult> {
        try {
            const storedGroup = this.findStoredGroup(
                request.id,
                request.original
            );
            if (
                !(await this.confirm(
                    `Delete the action group "${request.original.name}" from the ${storedGroup.target.label}?`,
                    "Delete"
                ))
            ) {
                return { ok: false };
            }
            await deleteActionGroup(storedGroup);
            return { ok: true };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : `${error}`,
            };
        }
    }

    public async openSettings(targetId: string) {
        const target = this.findTarget(targetId);
        switch (target.configurationTarget) {
            case vscode.ConfigurationTarget.Global:
                await vscode.commands.executeCommand(
                    "workbench.action.openSettingsJson"
                );
                break;
            case vscode.ConfigurationTarget.Workspace:
                await vscode.commands.executeCommand(
                    "workbench.action.openWorkspaceSettingsFile"
                );
                break;
            default:
                await vscode.commands.executeCommand(
                    "workbench.action.openFolderSettingsFile",
                    target.folder?.uri
                );
        }
    }
}

function createNonce() {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var nonce = "";
    for (let i = 0; i < 32; ++i) {
        nonce += characters.charAt(
            Math.floor(Math.random() * characters.length)
        );
    }
    return nonce;
}

export class ActionGroupEditorPanel {
    public static readonly viewType = "actionGroupExecuter.editor";
    private static current: ActionGroupEditorPanel | undefined;

    private panel: vscode.WebviewPanel;
    private controller: ActionGroupEditorController;
    private disposables = new Array<vscode.Disposable>();
    private ready = false;
    private pendingNewGroup = false;

    public static show(extensionUri: vscode.Uri, newGroup: boolean) {
        if (ActionGroupEditorPanel.current) {
            const current = ActionGroupEditorPanel.current;
            current.panel.reveal();
            if (newGroup) {
                current.requestNewGroup();
            }
            return current;
        }
        ActionGroupEditorPanel.current = new ActionGroupEditorPanel(
            extensionUri,
            newGroup
        );
        return ActionGroupEditorPanel.current;
    }

    private constructor(extensionUri: vscode.Uri, newGroup: boolean) {
        this.pendingNewGroup = newGroup;
        this.controller = new ActionGroupEditorController(
            async (message, confirmLabel) =>
                (await vscode.window.showWarningMessage(
                    message,
                    { modal: true },
                    confirmLabel
                )) === confirmLabel
        );

        const mediaRoot = vscode.Uri.joinPath(extensionUri, "media");
        const scriptRoot = vscode.Uri.joinPath(extensionUri, "out", "webview");
        this.panel = vscode.window.createWebviewPanel(
            ActionGroupEditorPanel.viewType,
            "Action Groups",
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                // Keep unsaved edits when the tab is in the background.
                retainContextWhenHidden: true,
                localResourceRoots: [mediaRoot, scriptRoot],
            }
        );

        const webview = this.panel.webview;
        const nonce = createNonce();
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(mediaRoot, "actionGroupEditor.css")
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(scriptRoot, "actionGroupEditor.js")
        );
        webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Action Groups</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}">var exports = {};</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;

        webview.onDidReceiveMessage(
            (message: WebviewMessage) => this.handleMessage(message),
            undefined,
            this.disposables
        );
        vscode.workspace.onDidChangeConfiguration(
            (event) => {
                if (
                    event.affectsConfiguration("actionGroupExecuter") ||
                    event.affectsConfiguration("launch") ||
                    event.affectsConfiguration("tasks")
                ) {
                    this.postState();
                }
            },
            undefined,
            this.disposables
        );
        vscode.extensions.onDidChange(
            () => this.postState(),
            undefined,
            this.disposables
        );
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }

    private post(message: ExtensionMessage) {
        this.panel.webview.postMessage(message);
    }

    private requestNewGroup() {
        if (this.ready) {
            this.post({ type: "newGroup" });
        } else {
            this.pendingNewGroup = true;
        }
    }

    private async postState() {
        if (this.ready) {
            this.post({ type: "state", state: await this.controller.getState() });
        }
    }

    private async handleMessage(message: WebviewMessage) {
        switch (message.type) {
            case "ready":
                this.ready = true;
                await this.postState();
                if (this.pendingNewGroup) {
                    this.pendingNewGroup = false;
                    this.post({ type: "newGroup" });
                }
                break;
            case "save":
            case "delete": {
                const result =
                    message.type === "save"
                        ? await this.controller.save(message.request)
                        : await this.controller.delete(message.request);
                this.post({
                    type: "result",
                    requestId: message.requestId,
                    result: result,
                    state: await this.controller.getState(),
                });
                break;
            }
            case "openSettings":
                await this.controller.openSettings(message.targetId);
                break;
        }
    }

    private dispose() {
        ActionGroupEditorPanel.current = undefined;
        this.disposables.forEach((disposable) => disposable.dispose());
        this.disposables = [];
    }
}

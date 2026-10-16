import * as vscode from "vscode";

import {
    EIActionGroup,
    EICommandAction,
    EIDebugSession,
    EIGroupNames,
    EIProcessAction,
    EIProcessCommand,
    EITaskAction,
    EITerminalAction,
} from "./configuration";
import {
    addActionGroup,
    cloneJson,
    deleteActionGroup,
    getSettingsTargets,
    getStoredActionGroups,
    replaceActionGroup,
    SettingsTarget,
    StoredActionGroup,
} from "./actionGroupSettings";
import { joinArguments, splitArguments } from "./utils";
import { getContributedCommands } from "./vscodeCommand";

// All user interaction of the wizard goes through this interface, so tests can script it.
export interface WizardUI {
    pick<T extends vscode.QuickPickItem>(
        items: Array<T>,
        options: vscode.QuickPickOptions
    ): Promise<T | undefined>;
    pickMany<T extends vscode.QuickPickItem>(
        items: Array<T>,
        options: vscode.QuickPickOptions
    ): Promise<Array<T> | undefined>;
    input(options: vscode.InputBoxOptions): Promise<string | undefined>;
    confirm(message: string, confirmLabel: string): Promise<boolean>;
    showInfo(message: string): void;
    showWarning(message: string): void;
}

export class VSCodeWizardUI implements WizardUI {
    public async pick<T extends vscode.QuickPickItem>(
        items: Array<T>,
        options: vscode.QuickPickOptions
    ) {
        return vscode.window.showQuickPick(items, options);
    }

    public async pickMany<T extends vscode.QuickPickItem>(
        items: Array<T>,
        options: vscode.QuickPickOptions
    ) {
        return vscode.window.showQuickPick(items, {
            ...options,
            canPickMany: true,
        });
    }

    public async input(options: vscode.InputBoxOptions) {
        return vscode.window.showInputBox(options);
    }

    public async confirm(message: string, confirmLabel: string) {
        const selection = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            confirmLabel
        );
        return selection === confirmLabel;
    }

    public showInfo(message: string) {
        vscode.window.showInformationMessage(message);
    }

    public showWarning(message: string) {
        vscode.window.showWarningMessage(message);
    }
}

interface ValueItem<T> extends vscode.QuickPickItem {
    value: T;
}

function separator<T>(label: string): ValueItem<T> {
    return {
        label: label,
        kind: vscode.QuickPickItemKind.Separator,
        value: undefined as T,
    };
}

// Moves the item matching the current value to the top, so it is preselected.
function markCurrent<T>(
    items: Array<ValueItem<T>>,
    isCurrent: (item: ValueItem<T>) => boolean
) {
    const index = items.findIndex(isCurrent);
    if (index >= 0) {
        const [current] = items.splice(index, 1);
        current.description = [current.description, "(current)"]
            .filter((part) => part)
            .join(" ");
        items.unshift(current);
    }
    return items;
}

const manualEntry = "$(edit) Enter manually…";

// Returns undefined when cancelled and 0 when no delay is wanted.
async function askDelay(
    ui: WizardUI,
    title: string,
    current: number | undefined
): Promise<number | undefined> {
    const value = await ui.input({
        title: title,
        prompt: "Start delay in ms (leave empty for no delay).",
        value: current ? `${current}` : "",
        validateInput: (text) =>
            /^\s*\d*\s*$/.test(text) ? undefined : "Enter a number of ms.",
    });
    if (value === undefined) {
        return undefined;
    }
    return value.trim() === "" ? 0 : parseInt(value, 10);
}

function setOrDelete<T extends object, K extends keyof T>(
    target: T,
    key: K,
    value: T[K] | undefined
) {
    if (value === undefined) {
        delete target[key];
    } else {
        target[key] = value;
    }
}

async function askRequiredText(
    ui: WizardUI,
    title: string,
    prompt: string,
    current: string | undefined
) {
    return ui.input({
        title: title,
        prompt: prompt,
        value: current ?? "",
        validateInput: (text) =>
            text.trim() === "" ? "A value is required." : undefined,
    });
}

function getTaskFolder(task: vscode.Task) {
    const scope = task.scope;
    if (typeof scope === "object" && scope !== null && "uri" in scope) {
        return scope as vscode.WorkspaceFolder;
    }
    return undefined;
}

async function buildTask(
    ui: WizardUI,
    existing: EITaskAction | undefined
): Promise<EITaskAction | undefined> {
    const title = "Task";
    const tasks = await vscode.tasks.fetchTasks();
    const seen = new Set<string>();
    const taskItems = new Array<ValueItem<vscode.Task | undefined>>();
    tasks.forEach((task) => {
        const folderName = getTaskFolder(task)?.name;
        const key = JSON.stringify([task.name, task.source, folderName]);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        taskItems.push({
            label: task.name,
            description: [task.source, folderName]
                .filter((part) => part)
                .join(" · "),
            value: task,
        });
    });
    taskItems.sort((a, b) => a.label.localeCompare(b.label));
    const items = [
        ...taskItems,
        separator<vscode.Task | undefined>(""),
        { label: manualEntry, value: undefined },
    ];
    if (existing) {
        markCurrent(
            items,
            (item) =>
                item.value?.name === existing.name &&
                (!existing.source || item.value.source === existing.source)
        );
    }

    const selection = await ui.pick(items, {
        title: title,
        placeHolder: "Select the task to run",
        matchOnDescription: true,
    });
    if (!selection) {
        return undefined;
    }

    const result: EITaskAction = existing
        ? cloneJson(existing)
        : { name: "" };
    const task = selection.value;
    if (task) {
        result.name = task.name;
        const folderName = getTaskFolder(task)?.name;
        const sameName = tasks.filter((other) => other.name === task.name);
        // Only store what is needed to find the task again.
        const ambiguousSource = sameName.some(
            (other) => other.source !== task.source
        );
        const ambiguousFolder = sameName.some(
            (other) =>
                other.source === task.source &&
                getTaskFolder(other)?.name !== folderName
        );
        setOrDelete(
            result,
            "source",
            ambiguousSource ? task.source : undefined
        );
        setOrDelete(
            result,
            "workspaceName",
            ambiguousFolder ? folderName : undefined
        );
    } else {
        const name = await askRequiredText(
            ui,
            title,
            "Name (label) of the task.",
            existing?.name
        );
        if (name === undefined) {
            return undefined;
        }
        result.name = name.trim();
    }

    const delay = await askDelay(ui, title, existing?.delayTask);
    if (delay === undefined) {
        return undefined;
    }
    setOrDelete(result, "delayTask", delay || undefined);
    return result;
}

async function buildCommand(
    ui: WizardUI,
    existing: EICommandAction | undefined
): Promise<EICommandAction | undefined> {
    const title = "VS Code command";
    const titles = getContributedCommands();
    const ids = new Set([
        ...(await vscode.commands.getCommands(true)),
        ...titles.keys(),
    ]);
    const titledItems = new Array<ValueItem<string | undefined>>();
    const plainItems = new Array<ValueItem<string | undefined>>();
    ids.forEach((id) => {
        const commandTitle = titles.get(id);
        if (commandTitle) {
            titledItems.push({
                label: commandTitle,
                description: id,
                value: id,
            });
        } else {
            plainItems.push({ label: id, value: id });
        }
    });
    titledItems.sort((a, b) => a.label.localeCompare(b.label));
    plainItems.sort((a, b) => a.label.localeCompare(b.label));
    const items = [
        { label: manualEntry, value: undefined },
        separator<string | undefined>(""),
        ...titledItems,
        ...plainItems,
    ];
    if (existing) {
        markCurrent(items, (item) => item.value === existing.id);
    }

    const selection = await ui.pick(items, {
        title: title,
        placeHolder: "Select the command to execute",
        matchOnDescription: true,
    });
    if (!selection) {
        return undefined;
    }

    var id = selection.value;
    if (!id) {
        id = await askRequiredText(
            ui,
            title,
            'ID of the command, e.g. "clangd.restart".',
            existing?.id
        );
        if (id === undefined) {
            return undefined;
        }
        id = id.trim();
    }

    const argsText = await ui.input({
        title: title,
        prompt: 'Arguments as JSON array, e.g. ["value", 1] (leave empty for none).',
        value:
            existing?.args && existing.args.length > 0
                ? JSON.stringify(existing.args)
                : "",
        validateInput: (text) => {
            if (text.trim() === "") {
                return undefined;
            }
            try {
                return Array.isArray(JSON.parse(text))
                    ? undefined
                    : "Enter a JSON array.";
            } catch {
                return "Enter a valid JSON array.";
            }
        },
    });
    if (argsText === undefined) {
        return undefined;
    }

    const delay = await askDelay(ui, title, existing?.delayCommand);
    if (delay === undefined) {
        return undefined;
    }

    const result: EICommandAction = existing ? cloneJson(existing) : { id };
    result.id = id;
    const args = argsText.trim() === "" ? [] : JSON.parse(argsText);
    setOrDelete(result, "args", args.length > 0 ? args : undefined);
    setOrDelete(result, "delayCommand", delay || undefined);
    return result;
}

async function buildTerminal(
    ui: WizardUI,
    existing: EITerminalAction | undefined
): Promise<EITerminalAction | undefined> {
    const title = "Terminal";
    const command = await askRequiredText(
        ui,
        title,
        "Command that is sent to the terminal.",
        existing?.command
    );
    if (command === undefined) {
        return undefined;
    }

    const name = await ui.input({
        title: title,
        prompt: "Name of the terminal (leave empty to use the action group name).",
        value: existing?.name ?? "",
    });
    if (name === undefined) {
        return undefined;
    }

    const showTerminal = existing?.showTerminal ?? true;
    const options: Array<ValueItem<keyof EITerminalAction>> = [
        {
            label: "Show terminal",
            description: "Put the terminal in the foreground.",
            picked: showTerminal,
            value: "showTerminal",
        },
        {
            label: "Always new terminal",
            description: "Create a new terminal even if one with the name exists.",
            picked: existing?.alwaysNewTerminal ?? false,
            value: "alwaysNewTerminal",
        },
        {
            label: "Dispose old terminal",
            description: "Close an existing terminal with the same name first.",
            picked: existing?.disposeOldTerminal ?? false,
            value: "disposeOldTerminal",
        },
    ];
    const selectedOptions = await ui.pickMany(options, {
        title: title,
        placeHolder: "Select the terminal options",
    });
    if (!selectedOptions) {
        return undefined;
    }
    const isSelected = (key: keyof EITerminalAction) =>
        selectedOptions.some((option) => option.value === key);

    const delay = await askDelay(ui, title, existing?.delayCommand);
    if (delay === undefined) {
        return undefined;
    }

    const result: EITerminalAction = existing
        ? cloneJson(existing)
        : { command: "" };
    result.command = command;
    setOrDelete(result, "name", name.trim() || undefined);
    // Only store values that differ from the defaults.
    setOrDelete(
        result,
        "showTerminal",
        isSelected("showTerminal") ? undefined : false
    );
    setOrDelete(
        result,
        "alwaysNewTerminal",
        isSelected("alwaysNewTerminal") ? true : undefined
    );
    setOrDelete(
        result,
        "disposeOldTerminal",
        isSelected("disposeOldTerminal") ? true : undefined
    );
    setOrDelete(result, "delayCommand", delay || undefined);
    return result;
}

async function buildProcess(
    ui: WizardUI,
    existing: EIProcessAction | undefined
): Promise<EIProcessAction | undefined> {
    const title = "Process";
    if (existing?.commands) {
        ui.showWarning(
            "Processes with sequential commands can only be edited in the settings.json."
        );
        return undefined;
    }

    const commandLine = await ui.input({
        title: title,
        prompt: 'Command line of the process, use quotes for arguments with spaces, e.g. ls -la "${env:HOME}".',
        value: existing?.command ? joinArguments(existing.command.call) : "",
        validateInput: (text) =>
            splitArguments(text).length === 0
                ? "A command is required."
                : undefined,
    });
    if (commandLine === undefined) {
        return undefined;
    }

    const name = await ui.input({
        title: title,
        prompt: "Name of the process, printed at the top of the output tab (leave empty for none).",
        value: existing?.name ?? "",
    });
    if (name === undefined) {
        return undefined;
    }

    const delay = await askDelay(ui, title, existing?.command?.delayProcess);
    if (delay === undefined) {
        return undefined;
    }

    const result: EIProcessAction = existing ? cloneJson(existing) : {};
    const command = (result.command ?? {}) as EIProcessCommand;
    command.call = splitArguments(commandLine);
    setOrDelete(command, "delayProcess", delay || undefined);
    result.command = command;
    setOrDelete(result, "name", name.trim() || undefined);
    return result;
}

interface LaunchEntry {
    name: string;
    folder?: vscode.WorkspaceFolder;
}

function getLaunchItems() {
    const items = new Array<ValueItem<LaunchEntry | undefined>>();
    const multiRoot = !!vscode.workspace.workspaceFile;

    function addEntries(
        configurations: unknown,
        compounds: unknown,
        source: string,
        folder: vscode.WorkspaceFolder | undefined
    ) {
        if (Array.isArray(configurations)) {
            configurations.forEach((configuration) => {
                if (typeof configuration?.name === "string") {
                    items.push({
                        label: configuration.name,
                        description: source,
                        detail: [configuration.type, configuration.request]
                            .filter((part) => part)
                            .join(" · "),
                        value: { name: configuration.name, folder: folder },
                    });
                }
            });
        }
        if (Array.isArray(compounds)) {
            compounds.forEach((compound) => {
                if (typeof compound?.name === "string") {
                    items.push({
                        label: compound.name,
                        description: source,
                        detail: "compound",
                        value: { name: compound.name, folder: folder },
                    });
                }
            });
        }
    }

    vscode.workspace.workspaceFolders?.forEach((folder) => {
        const launch = vscode.workspace.getConfiguration("launch", folder.uri);
        addEntries(
            launch.inspect("configurations")?.workspaceFolderValue,
            launch.inspect("compounds")?.workspaceFolderValue,
            folder.name,
            folder
        );
    });
    const launch = vscode.workspace.getConfiguration("launch");
    // Without a workspace file the workspace settings equal the folder settings.
    if (multiRoot) {
        addEntries(
            launch.inspect("configurations")?.workspaceValue,
            launch.inspect("compounds")?.workspaceValue,
            "Workspace",
            undefined
        );
    }
    addEntries(
        launch.inspect("configurations")?.globalValue,
        launch.inspect("compounds")?.globalValue,
        "User",
        undefined
    );
    return items;
}

async function buildDebugSession(
    ui: WizardUI,
    existing: EIDebugSession | undefined
): Promise<EIDebugSession | undefined> {
    const title = "Debug session";
    if (existing?.newConfiguration && !existing.namedConfiguration) {
        ui.showWarning(
            "Inline debug configurations can only be edited in the settings.json."
        );
        return undefined;
    }

    const items = [
        ...getLaunchItems(),
        separator<LaunchEntry | undefined>(""),
        { label: manualEntry, value: undefined },
    ];
    if (existing) {
        markCurrent(
            items,
            (item) =>
                item.value?.name === existing.namedConfiguration &&
                (!existing.workspaceName ||
                    item.value?.folder?.name === existing.workspaceName)
        );
    }
    const selection = await ui.pick(items, {
        title: title,
        placeHolder: "Select the launch configuration to debug",
        matchOnDescription: true,
    });
    if (!selection) {
        return undefined;
    }

    const result: EIDebugSession = existing ? cloneJson(existing) : {};
    if (selection.value) {
        result.namedConfiguration = selection.value.name;
        const multiRoot = !!vscode.workspace.workspaceFile;
        setOrDelete(
            result,
            "workspaceName",
            multiRoot ? selection.value.folder?.name : undefined
        );
    } else {
        const name = await askRequiredText(
            ui,
            title,
            "Name of the launch configuration.",
            existing?.namedConfiguration
        );
        if (name === undefined) {
            return undefined;
        }
        result.namedConfiguration = name.trim();
    }
    delete result.newConfiguration;
    delete result.requestUserInputArguments;

    const delay = await askDelay(ui, title, existing?.delaySession);
    if (delay === undefined) {
        return undefined;
    }
    setOrDelete(result, "delaySession", delay || undefined);
    return result;
}

type ActionKind = "task" | "command" | "terminal" | "process" | "debugSession";

const actionKindInfo: {
    [kind in ActionKind]: { icon: string; title: string };
} = {
    task: { icon: "$(checklist)", title: "Task" },
    command: { icon: "$(gear)", title: "VS Code command" },
    terminal: { icon: "$(terminal)", title: "Terminal" },
    process: { icon: "$(output)", title: "Process" },
    debugSession: { icon: "$(debug)", title: "Debug session" },
};

const listKeys = {
    task: "tasks",
    command: "commands",
    terminal: "terminals",
    process: "processes",
} as const;

interface ActionEntry {
    kind: ActionKind;
    index: number;
    label: string;
    description: string;
}

function joinDescription(parts: Array<string | undefined | false>) {
    return parts.filter((part) => part).join(" · ");
}

function delayText(delay: number | undefined) {
    return delay ? `delay ${delay} ms` : undefined;
}

function getActionEntries(draft: EIActionGroup): Array<ActionEntry> {
    const entries = new Array<ActionEntry>();
    const add = (
        kind: ActionKind,
        index: number,
        text: string,
        description: string
    ) => {
        const info = actionKindInfo[kind];
        entries.push({
            kind: kind,
            index: index,
            label: `${info.icon} ${info.title}: ${text}`,
            description: description,
        });
    };

    draft.tasks?.forEach((task, index) =>
        add(
            "task",
            index,
            task.name,
            joinDescription([
                task.source,
                task.workspaceName,
                delayText(task.delayTask),
            ])
        )
    );
    draft.commands?.forEach((command, index) =>
        add(
            "command",
            index,
            command.id,
            joinDescription([
                command.args &&
                    command.args.length > 0 &&
                    JSON.stringify(command.args),
                delayText(command.delayCommand),
            ])
        )
    );
    draft.terminals?.forEach((terminal, index) =>
        add(
            "terminal",
            index,
            terminal.command,
            joinDescription([terminal.name, delayText(terminal.delayCommand)])
        )
    );
    draft.processes?.forEach((process, index) =>
        add(
            "process",
            index,
            process.command
                ? joinArguments(process.command.call ?? [])
                : `${process.commands?.length ?? 0} sequential commands`,
            joinDescription([
                process.name,
                delayText(process.command?.delayProcess),
            ])
        )
    );
    if (draft.debugSession) {
        const session = draft.debugSession;
        add(
            "debugSession",
            0,
            session.namedConfiguration ??
                session.newConfiguration?.name ??
                "inline configuration",
            joinDescription([
                session.workspaceName,
                delayText(session.delaySession),
            ])
        );
    }
    return entries;
}

export function describeActionCounts(group: EIActionGroup) {
    const counts: Array<[number, string]> = [
        [group.tasks?.length ?? 0, "task"],
        [group.commands?.length ?? 0, "command"],
        [group.terminals?.length ?? 0, "terminal"],
        [group.processes?.length ?? 0, "process"],
        [group.debugSession ? 1 : 0, "debug session"],
    ];
    return counts
        .filter(([count]) => count > 0)
        .map(([count, name]) =>
            count === 1
                ? `1 ${name}`
                : `${count} ${name === "process" ? "processes" : name + "s"}`
        )
        .join(", ");
}

function getActionList(draft: EIActionGroup, kind: ActionKind): Array<any> {
    if (kind === "debugSession") {
        return [];
    }
    const key = listKeys[kind];
    if (!draft[key]) {
        draft[key] = [];
    }
    return draft[key] as Array<any>;
}

function cleanupActionList(draft: EIActionGroup, kind: ActionKind) {
    if (kind !== "debugSession" && draft[listKeys[kind]]?.length === 0) {
        delete draft[listKeys[kind]];
    }
}

async function buildAction(
    ui: WizardUI,
    kind: ActionKind,
    existing: any
): Promise<any> {
    switch (kind) {
        case "task":
            return buildTask(ui, existing);
        case "command":
            return buildCommand(ui, existing);
        case "terminal":
            return buildTerminal(ui, existing);
        case "process":
            return buildProcess(ui, existing);
        case "debugSession":
            return buildDebugSession(ui, existing);
    }
}

async function addAction(ui: WizardUI, draft: EIActionGroup) {
    const kinds: Array<ActionKind> = [
        "task",
        "command",
        "terminal",
        "process",
        "debugSession",
    ];
    const items = kinds.map((kind) => ({
        label: `${actionKindInfo[kind].icon} ${actionKindInfo[kind].title}…`,
        description:
            kind === "debugSession" && draft.debugSession
                ? "replaces the current debug session"
                : undefined,
        value: kind,
    }));
    const selection = await ui.pick(items, {
        title: `Add action to "${draft.name}"`,
        placeHolder: "Select the kind of action to add",
    });
    if (!selection) {
        return;
    }

    const action = await buildAction(ui, selection.value, undefined);
    if (!action) {
        return;
    }
    if (selection.value === "debugSession") {
        draft.debugSession = action;
    } else {
        getActionList(draft, selection.value).push(action);
    }
}

async function changeAction(
    ui: WizardUI,
    draft: EIActionGroup,
    entry: ActionEntry
) {
    const selection = await ui.pick(
        [
            { label: "$(edit) Edit", value: "edit" },
            { label: "$(trash) Remove", value: "remove" },
        ],
        { title: entry.label, placeHolder: "Select what to do with the action" }
    );
    if (!selection) {
        return;
    }

    if (entry.kind === "debugSession") {
        if (selection.value === "remove") {
            delete draft.debugSession;
            return;
        }
        const session = await buildAction(ui, entry.kind, draft.debugSession);
        if (session) {
            draft.debugSession = session;
        }
        return;
    }

    const list = getActionList(draft, entry.kind);
    if (selection.value === "remove") {
        list.splice(entry.index, 1);
        cleanupActionList(draft, entry.kind);
        return;
    }
    const action = await buildAction(ui, entry.kind, list[entry.index]);
    if (action) {
        list[entry.index] = action;
    }
}

async function askGroupName(ui: WizardUI, current: string | undefined) {
    const name = await askRequiredText(
        ui,
        "Action group name",
        "Name of the action group, as shown when executing action groups.",
        current
    );
    return name?.trim();
}

function folderPathText(groupNames: Array<EIGroupNames> | undefined) {
    return (groupNames ?? []).map((groupName) => groupName.name).join(" / ");
}

// Returns an empty list for the top level and undefined when cancelled.
async function pickGroupFolder(
    ui: WizardUI,
    current: Array<EIGroupNames> | undefined
): Promise<Array<EIGroupNames> | undefined> {
    // Collect all existing folder paths, including their parent folders.
    const knownPaths = new Map<string, Array<EIGroupNames>>();
    getStoredActionGroups().forEach((storedGroup) => {
        const groupNames = storedGroup.config.groupNames ?? [];
        for (let length = 1; length <= groupNames.length; ++length) {
            const prefix = groupNames.slice(0, length);
            const key = folderPathText(prefix);
            if (!knownPaths.has(key)) {
                knownPaths.set(key, cloneJson(prefix));
            }
        }
    });

    const currentText = folderPathText(current);
    const folderItems: Array<ValueItem<Array<EIGroupNames> | undefined>> = [
        { label: "$(root-folder) Top level", value: [] },
        ...[...knownPaths.keys()].sort().map((key) => ({
            label: `$(folder) ${key}`,
            value: knownPaths.get(key),
        })),
    ];
    markCurrent(folderItems, (item) =>
        currentText === ""
            ? item.value?.length === 0
            : folderPathText(item.value) === currentText
    );
    const items = [
        ...folderItems,
        { label: "$(new-folder) New folder…", value: undefined },
    ];
    const selection = await ui.pick(items, {
        title: "Group folder",
        placeHolder: "Select the folder the action group is shown in",
    });
    if (!selection) {
        return undefined;
    }
    if (selection.value) {
        return selection.value;
    }

    const pathText = await askRequiredText(
        ui,
        "Group folder",
        'Folder path, separate levels with "/", e.g. Backend/Build.',
        current?.map((groupName) => groupName.name).join("/")
    );
    if (pathText === undefined) {
        return undefined;
    }
    const names = pathText
        .split("/")
        .map((name) => name.trim())
        .filter((name) => name !== "");
    // Reuse known folder entries, so their sorting indexes are kept.
    return names.map((name, index) => {
        const known = knownPaths.get(names.slice(0, index + 1).join(" / "));
        return known ? known[index] : { name: name };
    });
}

async function pickSettingsTarget(ui: WizardUI) {
    const items = getSettingsTargets().map((target) => ({
        label: target.label,
        description:
            target.configurationTarget === vscode.ConfigurationTarget.Global
                ? "available in all workspaces"
                : undefined,
        value: target,
    }));
    const selection = await ui.pick(items, {
        title: "Save action group",
        placeHolder: "Select where the action group is stored",
    });
    return selection?.value;
}

interface DraftMode {
    title: string;
    // State the draft is compared to, to find out if there are unsaved changes.
    original: string;
    saveLabel: string;
    save: (draft: EIActionGroup) => Promise<boolean>;
    deleteGroup?: () => Promise<boolean>;
}

type MenuChoice =
    | { type: "action"; entry: ActionEntry }
    | { type: "add" | "name" | "folder" | "save" | "delete" };

async function editDraft(
    ui: WizardUI,
    draft: EIActionGroup,
    mode: DraftMode
) {
    while (true) {
        const actionEntries = getActionEntries(draft);
        const items: Array<ValueItem<MenuChoice | undefined>> = [];
        if (actionEntries.length > 0) {
            items.push(separator("Actions"));
            actionEntries.forEach((entry) =>
                items.push({
                    label: entry.label,
                    description: entry.description,
                    value: { type: "action", entry: entry },
                })
            );
            items.push(separator("Action group"));
        }
        items.push(
            { label: "$(add) Add action…", value: { type: "add" } },
            {
                label: `$(edit) Name: ${draft.name}`,
                value: { type: "name" },
            },
            {
                label: `$(folder) Group folder: ${
                    folderPathText(draft.groupNames) || "top level"
                }`,
                value: { type: "folder" },
            },
            { label: mode.saveLabel, value: { type: "save" } }
        );
        if (mode.deleteGroup) {
            items.push({
                label: "$(trash) Delete action group",
                value: { type: "delete" },
            });
        }

        const selection = await ui.pick(items, {
            title: `${mode.title} "${draft.name}"`,
            placeHolder: "Select an action to change it, or what to do next",
        });
        const choice = selection?.value;

        if (!choice) {
            if (
                JSON.stringify(draft) === mode.original ||
                (await ui.confirm(
                    `Discard the changes to "${draft.name}"?`,
                    "Discard"
                ))
            ) {
                return;
            }
            continue;
        }

        switch (choice.type) {
            case "action":
                await changeAction(ui, draft, choice.entry);
                break;
            case "add":
                await addAction(ui, draft);
                break;
            case "name": {
                const name = await askGroupName(ui, draft.name);
                if (name) {
                    draft.name = name;
                }
                break;
            }
            case "folder": {
                const groupNames = await pickGroupFolder(ui, draft.groupNames);
                if (groupNames) {
                    setOrDelete(
                        draft,
                        "groupNames",
                        groupNames.length > 0 ? groupNames : undefined
                    );
                }
                break;
            }
            case "save":
                if (describeActionCounts(draft) === "") {
                    ui.showWarning("Add at least one action before saving.");
                    break;
                }
                if (await runSafely(ui, () => mode.save(draft))) {
                    return;
                }
                break;
            case "delete":
                if (
                    mode.deleteGroup &&
                    (await runSafely(ui, mode.deleteGroup))
                ) {
                    return;
                }
                break;
        }
    }
}

// Shows errors (e.g. settings changed in the meantime) and ends the wizard on them.
async function runSafely(ui: WizardUI, callback: () => Promise<boolean>) {
    try {
        return await callback();
    } catch (error) {
        ui.showWarning(error instanceof Error ? error.message : `${error}`);
        return true;
    }
}

async function pickStoredGroup(ui: WizardUI, title: string) {
    const storedGroups = getStoredActionGroups();
    if (storedGroups.length === 0) {
        ui.showInfo("No action groups are configured yet.");
        return undefined;
    }
    const items = storedGroups.map((storedGroup) => ({
        label: storedGroup.config.name,
        description: storedGroup.target.label,
        detail: joinDescription([
            folderPathText(storedGroup.config.groupNames),
            describeActionCounts(storedGroup.config),
        ]),
        value: storedGroup,
    }));
    const selection = await ui.pick(items, {
        title: title,
        placeHolder: "Select an action group",
        matchOnDescription: true,
        matchOnDetail: true,
    });
    return selection?.value;
}

async function confirmAndDelete(ui: WizardUI, storedGroup: StoredActionGroup) {
    if (
        !(await ui.confirm(
            `Delete the action group "${storedGroup.config.name}" from the ${storedGroup.target.label}?`,
            "Delete"
        ))
    ) {
        return false;
    }
    await deleteActionGroup(storedGroup);
    ui.showInfo(`Deleted the action group "${storedGroup.config.name}".`);
    return true;
}

export async function createActionGroupWizard(
    ui: WizardUI = new VSCodeWizardUI()
) {
    const name = await askGroupName(ui, undefined);
    if (!name) {
        return;
    }
    const draft: EIActionGroup = { name: name };
    const original = JSON.stringify(draft);
    await addAction(ui, draft);

    await editDraft(ui, draft, {
        title: "Create action group",
        original: original,
        saveLabel: "$(save) Save…",
        save: async (group) => {
            const target = await pickSettingsTarget(ui);
            if (!target) {
                return false;
            }
            await addActionGroup(target, group);
            ui.showInfo(
                `Saved the action group "${group.name}" to the ${target.label}.`
            );
            return true;
        },
    });
}

export async function editActionGroupWizard(
    ui: WizardUI = new VSCodeWizardUI()
) {
    const storedGroup = await pickStoredGroup(ui, "Edit action group");
    if (!storedGroup) {
        return;
    }

    await editDraft(ui, cloneJson(storedGroup.config), {
        title: "Edit action group",
        original: JSON.stringify(storedGroup.config),
        saveLabel: "$(save) Save changes",
        save: async (group) => {
            await replaceActionGroup(storedGroup, group);
            ui.showInfo(`Saved the action group "${group.name}".`);
            return true;
        },
        deleteGroup: () => confirmAndDelete(ui, storedGroup),
    });
}

export async function deleteActionGroupWizard(
    ui: WizardUI = new VSCodeWizardUI()
) {
    const storedGroup = await pickStoredGroup(ui, "Delete action group");
    if (!storedGroup) {
        return;
    }
    await runSafely(ui, () => confirmAndDelete(ui, storedGroup));
}

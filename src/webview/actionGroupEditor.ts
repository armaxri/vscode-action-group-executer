/// <reference lib="dom" />
// Runs inside the action group editor webview. It only imports types, the module
// boilerplate tsc emits is satisfied by a small "exports" shim in the page.
import type {
    EditorGroup,
    EditorState,
    ExtensionMessage,
    LaunchChoice,
    TaskChoice,
    WebviewMessage,
} from "../actionGroupEditorProtocol";
import type {
    EIActionGroup,
    EICommandAction,
    EIProcessAction,
    EITaskAction,
    EITerminalAction,
} from "../configuration";

declare function acquireVsCodeApi(): {
    postMessage(message: WebviewMessage): void;
};

(function () {
    const vscodeApi = acquireVsCodeApi();

    interface Draft {
        // Id of the stored group or "new:<n>" for groups that are not saved yet.
        id: string;
        isNew: boolean;
        original?: EIActionGroup;
        targetId: string;
        config: EIActionGroup;
        folderPath: string;
        processLines: Array<string | null>;
        baseline: string;
        conflict: boolean;
        error?: string;
    }

    var state: EditorState | undefined;
    const drafts = new Map<string, Draft>();
    var selectedId: string | undefined;
    var filterText = "";
    var nextNewId = 1;
    var nextRequestId = 1;
    const pendingRequests = new Map<number, string>();
    var statusMessage = "";
    // Text of argument inputs that is not valid JSON (yet), keyed by the command entry.
    const invalidArgs = new Map<EICommandAction, string>();

    const app = document.getElementById("app")!;
    app.className = "layout";
    const sidebar = document.createElement("nav");
    sidebar.className = "sidebar";
    const main = document.createElement("main");
    main.className = "main";
    app.append(sidebar, main);

    // ---------------------------------------------------------------- helpers

    type Child = Node | string | undefined | false;

    function el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        attributes: { [name: string]: string | boolean | undefined } = {},
        ...children: Array<Child | Array<Child>>
    ): HTMLElementTagNameMap[K] {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            // camelCase keys like ariaLabel become aria-label.
            const name = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
            if (value === true) {
                element.setAttribute(name, "");
            } else if (typeof value === "string") {
                element.setAttribute(name, value);
            }
        });
        children.flat().forEach((child) => {
            if (child) {
                element.append(child);
            }
        });
        return element;
    }

    function button(
        label: string,
        className: string,
        onClick: () => void,
        title?: string
    ) {
        const element = el("button", { class: className, type: "button", title });
        element.textContent = label;
        element.addEventListener("click", onClick);
        return element;
    }

    function clone<T>(value: T): T {
        return JSON.parse(JSON.stringify(value));
    }

    function snapshot(draft: Draft) {
        return JSON.stringify([
            draft.targetId,
            draft.config,
            draft.folderPath,
            draft.processLines,
        ]);
    }

    function isDirty(draft: Draft) {
        return draft.isNew || snapshot(draft) !== draft.baseline;
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

    function parseDelay(text: string) {
        const value = parseInt(text, 10);
        return isNaN(value) || value <= 0 ? undefined : value;
    }

    function findGroup(id: string | undefined) {
        return state?.groups.find((group) => group.id === id);
    }

    function draftFromGroup(group: EditorGroup): Draft {
        const draft: Draft = {
            id: group.id,
            isNew: false,
            original: clone(group.config),
            targetId: group.targetId,
            config: clone(group.config),
            folderPath: group.folderPath,
            processLines: [...group.processLines],
            baseline: "",
            conflict: false,
        };
        draft.baseline = snapshot(draft);
        return draft;
    }

    function getDraft(id: string | undefined) {
        if (!id) {
            return undefined;
        }
        var draft = drafts.get(id);
        if (!draft) {
            const group = findGroup(id);
            if (!group) {
                return undefined;
            }
            draft = draftFromGroup(group);
            drafts.set(id, draft);
        }
        return draft;
    }

    function targetLabel(targetId: string) {
        return (
            state?.targets.find((target) => target.id === targetId)?.label ??
            "Unavailable settings"
        );
    }

    // Keeps unsaved edits when the stored settings change, e.g. after saving another group.
    function reconcileDrafts() {
        const selectedGroup = findGroup(selectedId);
        const selectedOriginal = selectedGroup
            ? JSON.stringify(selectedGroup.config)
            : undefined;

        [...drafts.values()].forEach((draft) => {
            if (draft.isNew) {
                return;
            }
            const original = JSON.stringify(draft.original);
            const matches = (group: EditorGroup) =>
                JSON.stringify(group.config) === original;
            const current = findGroup(draft.id);
            if (current && matches(current)) {
                draft.conflict = false;
                return;
            }
            const moved = state?.groups.find(
                (group) => group.targetId === draft.targetId && matches(group)
            );
            drafts.delete(draft.id);
            if (moved) {
                if (selectedId === draft.id) {
                    selectedId = moved.id;
                }
                draft.id = moved.id;
            } else {
                draft.conflict = true;
            }
            if (isDirty(draft) || draft.conflict) {
                drafts.set(draft.id, draft);
            }
        });

        // Unchanged drafts are recreated from the new state when needed.
        [...drafts.values()].forEach((draft) => {
            if (!isDirty(draft) && !draft.conflict) {
                drafts.delete(draft.id);
            }
        });

        if (selectedId && !drafts.has(selectedId) && !findGroup(selectedId)) {
            const moved = state?.groups.find(
                (group) => JSON.stringify(group.config) === selectedOriginal
            );
            selectedId = moved?.id;
        }
    }

    function createNewGroup() {
        const id = `new:${nextNewId++}`;
        const draft: Draft = {
            id: id,
            isNew: true,
            targetId: state?.targets[0]?.id ?? "",
            config: { name: "" },
            folderPath: "",
            processLines: [],
            baseline: "",
            conflict: false,
        };
        draft.baseline = snapshot(draft);
        drafts.set(id, draft);
        selectedId = id;
        statusMessage = "";
        render();
        main.querySelector<HTMLInputElement>("#group-name")?.focus();
    }

    // ---------------------------------------------------------------- sidebar

    function renderSidebar() {
        sidebar.replaceChildren();
        const header = el(
            "div",
            { class: "sidebar-header" },
            el("h1", {}, "Action Groups"),
            button("New", "primary small", createNewGroup, "Create a new action group")
        );
        const filter = el("input", {
            type: "search",
            class: "filter",
            placeholder: "Filter action groups",
            ariaLabel: "Filter action groups",
            value: filterText,
        });
        filter.addEventListener("input", () => {
            filterText = filter.value;
            renderTree();
            filter.focus();
        });
        const tree = el("div", { class: "tree", role: "list" });
        sidebar.append(header, filter, tree);

        function renderTree() {
            tree.replaceChildren();
            if (!state) {
                return;
            }
            const filterValue = filterText.trim().toLowerCase();

            state.targets.forEach((target) => {
                const entries = new Array<{ id: string; name: string; folder: string; dirty: boolean; isNew: boolean }>();
                state!.groups
                    .filter((group) => group.targetId === target.id)
                    .forEach((group) => {
                        const draft = drafts.get(group.id);
                        entries.push({
                            id: group.id,
                            name: draft ? draft.config.name : group.config.name,
                            folder: draft ? draft.folderPath : group.folderPath,
                            dirty: !!draft && isDirty(draft),
                            isNew: false,
                        });
                    });
                drafts.forEach((draft) => {
                    if (draft.isNew && draft.targetId === target.id) {
                        entries.push({
                            id: draft.id,
                            name: draft.config.name,
                            folder: draft.folderPath,
                            dirty: true,
                            isNew: true,
                        });
                    }
                });

                const visible = entries.filter(
                    (entry) =>
                        filterValue === "" ||
                        `${entry.folder} ${entry.name}`
                            .toLowerCase()
                            .includes(filterValue)
                );
                if (filterValue !== "" && visible.length === 0) {
                    return;
                }

                tree.append(el("div", { class: "tree-target" }, target.label));
                if (visible.length === 0) {
                    tree.append(el("div", { class: "tree-empty" }, "No action groups"));
                    return;
                }

                const folders = [...new Set(visible.map((entry) => entry.folder))].sort();
                folders.forEach((folder) => {
                    if (folder !== "") {
                        tree.append(el("div", { class: "tree-folder" }, folder));
                    }
                    visible
                        .filter((entry) => entry.folder === folder)
                        .forEach((entry) => {
                            const item = el(
                                "button",
                                {
                                    type: "button",
                                    role: "listitem",
                                    class:
                                        "tree-item" +
                                        (folder !== "" ? " nested" : "") +
                                        (entry.id === selectedId ? " selected" : ""),
                                    ariaCurrent: entry.id === selectedId ? "true" : undefined,
                                },
                                el("span", { class: "tree-name" }, entry.name || "Unnamed group"),
                                entry.isNew && el("span", { class: "tree-badge" }, "new"),
                                entry.dirty && el("span", { class: "dirty", title: "Unsaved changes" }, "●")
                            );
                            item.addEventListener("click", () => {
                                selectedId = entry.id;
                                statusMessage = "";
                                render();
                            });
                            tree.append(item);
                        });
                });
            });
        }
        renderTree();
    }

    // ---------------------------------------------------------------- form parts

    function field(label: string, control: HTMLElement, hint?: string, wide = false) {
        const id = control.id || `field-${Math.random().toString(36).slice(2)}`;
        control.id = id;
        return el(
            "div",
            { class: "field" + (wide ? " wide" : "") },
            el("label", { for: id }, label),
            control,
            hint && el("div", { class: "hint" }, hint)
        );
    }

    function textInput(value: string | undefined, onInput: (value: string) => void, attributes: { [name: string]: string | boolean | undefined } = {}) {
        const input = el("input", { type: "text", value: value ?? "", ...attributes });
        input.addEventListener("input", () => {
            onInput(input.value);
            refreshStatus();
        });
        return input;
    }

    function delayInput(value: number | undefined, onChange: (value: number | undefined) => void) {
        return field(
            "Delay (ms)",
            textInput(value ? `${value}` : "", (text) => onChange(parseDelay(text)), {
                inputmode: "numeric",
                placeholder: "0",
                class: "short",
            })
        );
    }

    function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void) {
        const input = el("input", { type: "checkbox", checked: checked });
        input.addEventListener("change", () => {
            onChange(input.checked);
            refreshStatus();
        });
        return el("label", { class: "checkbox" }, input, label);
    }

    function card(title: string, onRemove: () => void, ...content: Array<Child>) {
        return el(
            "div",
            { class: "card" },
            el(
                "div",
                { class: "card-header" },
                el("span", { class: "card-title" }, title),
                button("Remove", "link danger", onRemove, `Remove this ${title.toLowerCase()}`)
            ),
            el("div", { class: "card-body" }, ...content)
        );
    }

    function section(
        title: string,
        description: string,
        count: number,
        cards: Array<HTMLElement>,
        addLabel: string | undefined,
        onAdd: () => void
    ) {
        return el(
            "section",
            { class: "section" },
            el(
                "div",
                { class: "section-header" },
                el("h2", {}, title, count > 0 && el("span", { class: "count" }, `${count}`)),
                el("p", { class: "description" }, description)
            ),
            ...cards,
            addLabel && button(addLabel, "secondary", onAdd)
        );
    }

    function taskLabel(choice: TaskChoice) {
        return `${choice.name} — ${[choice.source, choice.folder].filter((part) => part).join(" · ")}`;
    }

    function matchesTask(task: EITaskAction, choice: TaskChoice) {
        return (
            choice.name === task.name &&
            (!task.source || choice.source === task.source) &&
            (!task.workspaceName || choice.folder === task.workspaceName)
        );
    }

    function renderTask(draft: Draft, task: EITaskAction, index: number) {
        const choices = state!.choices.tasks;
        const select = el("select", {});
        const selectedIndex = choices.findIndex((choice) => matchesTask(task, choice));
        if (!task.name) {
            select.append(el("option", { value: "", disabled: true, selected: true }, "Select a task…"));
        } else if (selectedIndex < 0) {
            select.append(el("option", { value: "", selected: true }, `${task.name} (not found)`));
        }
        choices.forEach((choice, choiceIndex) =>
            select.append(
                el("option", { value: `${choiceIndex}`, selected: choiceIndex === selectedIndex }, taskLabel(choice))
            )
        );
        select.addEventListener("change", () => {
            const choice = choices[parseInt(select.value, 10)];
            if (!choice) {
                return;
            }
            task.name = choice.name;
            // Only store what is needed to find the task again.
            const sameName = choices.filter((other) => other.name === choice.name);
            setOrDelete(task, "source", sameName.some((other) => other.source !== choice.source) ? choice.source : undefined);
            setOrDelete(
                task,
                "workspaceName",
                sameName.some((other) => other.source === choice.source && other.folder !== choice.folder)
                    ? choice.folder
                    : undefined
            );
            refreshStatus();
        });

        return card(
            "Task",
            () => removeListEntry(draft, "tasks", index),
            el(
                "div",
                { class: "row" },
                field("Task", select, choices.length === 0 ? "No tasks found in this workspace." : undefined, true),
                delayInput(task.delayTask, (value) => setOrDelete(task, "delayTask", value))
            )
        );
    }

    function renderCommand(draft: Draft, command: EICommandAction, index: number) {
        const titleHint = el("div", { class: "hint" });
        const updateTitle = () => {
            const choice = state!.choices.commands.find((choice) => choice.id === command.id.trim());
            titleHint.textContent = !command.id
                ? "Type to search command IDs and titles."
                : choice
                ? choice.title ?? "Known command"
                : "Unknown command. It may belong to an extension that is not installed.";
            titleHint.classList.toggle("warning", !!command.id && !choice);
        };
        const idInput = textInput(command.id, (value) => {
            command.id = value.trim();
            updateTitle();
        }, { list: "command-choices", placeholder: "e.g. clangd.restart", spellcheck: "false" });
        updateTitle();

        const argsInput = textInput(
            invalidArgs.get(command) ?? (command.args && command.args.length > 0 ? JSON.stringify(command.args) : ""),
            (text) => {
                if (text.trim() === "") {
                    invalidArgs.delete(command);
                    delete command.args;
                } else {
                    try {
                        const parsed = JSON.parse(text);
                        if (!Array.isArray(parsed)) {
                            throw new Error();
                        }
                        invalidArgs.delete(command);
                        setOrDelete(command, "args", parsed.length > 0 ? parsed : undefined);
                    } catch {
                        invalidArgs.set(command, text);
                    }
                }
                argsInput.classList.toggle("invalid", invalidArgs.has(command));
            },
            { placeholder: '["value", 1]', spellcheck: "false" }
        );
        argsInput.classList.toggle("invalid", invalidArgs.has(command));

        const idField = field("Command", idInput, undefined, true);
        idField.append(titleHint);
        return card(
            "VS Code command",
            () => {
                invalidArgs.delete(command);
                removeListEntry(draft, "commands", index);
            },
            el("div", { class: "row" }, idField, delayInput(command.delayCommand, (value) => setOrDelete(command, "delayCommand", value))),
            el("div", { class: "row" }, field("Arguments", argsInput, "Optional JSON array passed to the command.", true))
        );
    }

    function renderTerminal(draft: Draft, terminal: EITerminalAction, index: number) {
        return card(
            "Terminal",
            () => removeListEntry(draft, "terminals", index),
            el(
                "div",
                { class: "row" },
                field("Command", textInput(terminal.command, (value) => (terminal.command = value), { placeholder: "npm run dev", spellcheck: "false" }), undefined, true),
                delayInput(terminal.delayCommand, (value) => setOrDelete(terminal, "delayCommand", value))
            ),
            el(
                "div",
                { class: "row" },
                field("Terminal name", textInput(terminal.name, (value) => setOrDelete(terminal, "name", value.trim() || undefined), { placeholder: "Action group name" }), undefined, true),
                field(
                    "Working directory",
                    textInput(terminal.extendedOptions?.cwd?.toString(), (value) => {
                        const options = terminal.extendedOptions ?? {};
                        setOrDelete(options, "cwd", value.trim() || undefined);
                        setOrDelete(terminal, "extendedOptions", Object.keys(options).length > 0 ? options : undefined);
                    }, { placeholder: "${workspaceFolder}", spellcheck: "false" }),
                    undefined,
                    true
                )
            ),
            el(
                "div",
                { class: "checkboxes" },
                checkbox("Show terminal", terminal.showTerminal ?? true, (checked) => setOrDelete(terminal, "showTerminal", checked ? undefined : false)),
                checkbox("Always new terminal", terminal.alwaysNewTerminal ?? false, (checked) => setOrDelete(terminal, "alwaysNewTerminal", checked ? true : undefined)),
                checkbox("Close old terminal first", terminal.disposeOldTerminal ?? false, (checked) => setOrDelete(terminal, "disposeOldTerminal", checked ? true : undefined))
            )
        );
    }

    function renderProcess(draft: Draft, process: EIProcessAction, index: number) {
        const remove = () => {
            draft.processLines.splice(index, 1);
            removeListEntry(draft, "processes", index);
        };
        const line = draft.processLines[index];
        if (line === null || !process.command) {
            return card(
                "Process",
                remove,
                el(
                    "p",
                    { class: "notice" },
                    `${process.name ? `"${process.name}" runs` : "Runs"} ${process.commands?.length ?? 0} commands in sequence. Edit them in the settings JSON.`
                ),
                button("Open settings JSON", "link", () => vscodeApi.postMessage({ type: "openSettings", targetId: draft.targetId }))
            );
        }
        const command = process.command;
        return card(
            "Process",
            remove,
            el(
                "div",
                { class: "row" },
                field(
                    "Command line",
                    textInput(line, (value) => (draft.processLines[index] = value), { placeholder: 'ls -la "${workspaceFolder}"', spellcheck: "false" }),
                    "The output is shown in an editor tab. Quote arguments that contain spaces.",
                    true
                ),
                delayInput(command.delayProcess, (value) => setOrDelete(command, "delayProcess", value))
            ),
            el(
                "div",
                { class: "row" },
                field("Name", textInput(process.name, (value) => setOrDelete(process, "name", value.trim() || undefined), { placeholder: "Shown at the top of the output" }), undefined, true),
                field(
                    "Working directory",
                    textInput(command.extendedOptions?.cwd?.toString(), (value) => {
                        const options = command.extendedOptions ?? {};
                        setOrDelete(options, "cwd", value.trim() || undefined);
                        setOrDelete(command, "extendedOptions", Object.keys(options).length > 0 ? options : undefined);
                    }, { placeholder: "${workspaceFolder}", spellcheck: "false" }),
                    undefined,
                    true
                )
            )
        );
    }

    function launchLabel(choice: LaunchChoice) {
        return `${choice.name} — ${[choice.location, choice.detail].filter((part) => part).join(" · ")}`;
    }

    function renderDebugSession(draft: Draft) {
        const session = draft.config.debugSession!;
        const remove = () => {
            delete draft.config.debugSession;
            render();
        };
        if (session.newConfiguration && !session.namedConfiguration) {
            return card(
                "Debug session",
                remove,
                el("p", { class: "notice" }, "Uses an inline launch configuration. Edit it in the settings JSON."),
                button("Open settings JSON", "link", () => vscodeApi.postMessage({ type: "openSettings", targetId: draft.targetId }))
            );
        }

        const choices = state!.choices.launches;
        const selectedIndex = choices.findIndex(
            (choice) =>
                choice.name === session.namedConfiguration &&
                (!session.workspaceName || choice.folder === session.workspaceName)
        );
        const select = el("select", {});
        if (!session.namedConfiguration) {
            select.append(el("option", { value: "", disabled: true, selected: true }, "Select a launch configuration…"));
        } else if (selectedIndex < 0) {
            select.append(el("option", { value: "", selected: true }, `${session.namedConfiguration} (not found)`));
        }
        choices.forEach((choice, choiceIndex) =>
            select.append(el("option", { value: `${choiceIndex}`, selected: choiceIndex === selectedIndex }, launchLabel(choice)))
        );
        select.addEventListener("change", () => {
            const choice = choices[parseInt(select.value, 10)];
            if (!choice) {
                return;
            }
            session.namedConfiguration = choice.name;
            setOrDelete(session, "workspaceName", state!.choices.multiRoot ? choice.folder : undefined);
            delete session.newConfiguration;
            delete session.requestUserInputArguments;
            refreshStatus();
        });

        return card(
            "Debug session",
            remove,
            el(
                "div",
                { class: "row" },
                field("Launch configuration", select, choices.length === 0 ? "No launch configurations found." : undefined, true),
                delayInput(session.delaySession, (value) => setOrDelete(session, "delaySession", value))
            )
        );
    }

    function removeListEntry(draft: Draft, key: "tasks" | "commands" | "terminals" | "processes", index: number) {
        const list = draft.config[key] as Array<unknown> | undefined;
        list?.splice(index, 1);
        if (list && list.length === 0) {
            delete draft.config[key];
        }
        render();
    }

    function addListEntry<K extends "tasks" | "commands" | "terminals" | "processes">(
        draft: Draft,
        key: K,
        entry: NonNullable<EIActionGroup[K]>[number]
    ) {
        if (!draft.config[key]) {
            (draft.config as any)[key] = [];
        }
        (draft.config[key] as Array<unknown>).push(entry);
        render();
        // Focus the first control of the new entry.
        const cards = main.querySelectorAll<HTMLElement>(`[data-section="${key}"] .card`);
        cards[cards.length - 1]?.querySelector<HTMLElement>("input, select")?.focus();
    }

    // ---------------------------------------------------------------- main form

    function validate(draft: Draft) {
        if (!draft.config.name.trim()) {
            return "Enter a name for the action group.";
        }
        if (draft.config.commands?.some((command) => invalidArgs.has(command))) {
            return "Fix the command arguments, they must be a JSON array.";
        }
        return undefined;
    }

    function save(draft: Draft) {
        const error = validate(draft);
        if (error) {
            draft.error = error;
            render();
            return;
        }
        draft.error = undefined;
        const requestId = nextRequestId++;
        pendingRequests.set(requestId, draft.id);
        vscodeApi.postMessage({
            type: "save",
            requestId: requestId,
            request: {
                id: draft.isNew ? undefined : draft.id,
                original: draft.original,
                targetId: draft.targetId,
                config: draft.config,
                folderPath: draft.folderPath,
                processLines: draft.processLines,
            },
        });
        refreshStatus();
    }

    function revert(draft: Draft) {
        drafts.delete(draft.id);
        if (draft.isNew) {
            selectedId = undefined;
        }
        statusMessage = "";
        render();
    }

    function deleteGroup(draft: Draft) {
        const requestId = nextRequestId++;
        pendingRequests.set(requestId, draft.id);
        vscodeApi.postMessage({
            type: "delete",
            requestId: requestId,
            request: { id: draft.id, original: draft.original! },
        });
    }

    var refreshStatus = () => renderSidebar();

    function renderMain() {
        main.replaceChildren();
        const draft = getDraft(selectedId);

        if (!state) {
            main.append(el("p", { class: "empty" }, "Loading…"));
            return;
        }
        if (!draft) {
            main.append(
                el(
                    "div",
                    { class: "empty" },
                    el("h2", {}, state.groups.length === 0 ? "No action groups yet" : "Select an action group"),
                    el("p", {}, "An action group starts tasks, VS Code commands, terminals, processes and a debug session together."),
                    button("Create action group", "primary", createNewGroup)
                )
            );
            return;
        }

        const config = draft.config;
        const status = el("span", { class: "status", role: "status" });
        const saveButton = button(draft.isNew ? "Create" : "Save", "primary", () => save(draft), "Save (Ctrl+S / Cmd+S)");
        const revertButton = button(draft.isNew ? "Discard" : "Revert", "secondary", () => revert(draft));
        const heading = el("h1", {});

        refreshStatus = () => {
            renderSidebar();
            const dirty = isDirty(draft);
            heading.textContent = config.name.trim() || (draft.isNew ? "New action group" : "Unnamed group");
            saveButton.disabled = !dirty;
            revertButton.disabled = !dirty;
            const saving = [...pendingRequests.values()].includes(draft.id);
            status.textContent = saving ? "Saving…" : dirty ? "Unsaved changes" : statusMessage;
        };

        const nameInput = textInput(config.name, (value) => (config.name = value), {
            id: "group-name",
            placeholder: "e.g. Build and debug",
            required: true,
        });
        const folderInput = textInput(draft.folderPath, (value) => (draft.folderPath = value), {
            list: "folder-choices",
            placeholder: "Top level",
        });
        const sortingInput = textInput(config.sortingIndex !== undefined ? `${config.sortingIndex}` : "", (value) => {
            const parsed = parseInt(value, 10);
            setOrDelete(config, "sortingIndex", isNaN(parsed) ? undefined : parsed);
        }, { inputmode: "numeric", class: "short", placeholder: "Default" });

        const targetSelect = el("select", {});
        state.targets.forEach((target) =>
            targetSelect.append(el("option", { value: target.id, selected: target.id === draft.targetId }, target.label))
        );
        if (!state.targets.some((target) => target.id === draft.targetId)) {
            targetSelect.append(el("option", { value: draft.targetId, selected: true }, "Unavailable settings"));
        }
        const original = draft.isNew ? undefined : findGroup(draft.id);
        const moveHint = el("div", { class: "hint" });
        const updateMoveHint = () => {
            moveHint.textContent =
                original && draft.targetId !== original.targetId
                    ? `Will be moved from the ${targetLabel(original.targetId)} when saved.`
                    : "Workspace settings can be shared with your team, user settings only apply to you.";
        };
        updateMoveHint();
        targetSelect.addEventListener("change", () => {
            draft.targetId = targetSelect.value;
            updateMoveHint();
            refreshStatus();
        });
        const storageField = field("Saved in", targetSelect);
        storageField.append(moveHint);

        const banners = [
            draft.conflict &&
                el("div", { class: "banner warning" }, "This action group was changed or removed outside the editor, so your changes can't be saved. Revert to load the current version."),
            draft.error && el("div", { class: "banner error", role: "alert" }, draft.error),
        ];

        const datalists = [
            el("datalist", { id: "folder-choices" }, state.choices.folderPaths.map((path) => el("option", { value: path }))),
            el(
                "datalist",
                { id: "command-choices" },
                state.choices.commands.map((choice) => el("option", { value: choice.id }, choice.title ?? ""))
            ),
        ];

        const tasks = config.tasks ?? [];
        const commands = config.commands ?? [];
        const terminals = config.terminals ?? [];
        const processes = config.processes ?? [];

        const sections = [
            section(
                "Tasks",
                "Tasks from tasks.json or provided by extensions, e.g. npm scripts.",
                tasks.length,
                tasks.map((task, index) => renderTask(draft, task, index)),
                "Add task",
                () => addListEntry(draft, "tasks", { name: "" })
            ),
            section(
                "VS Code commands",
                "Any command from the Command Palette or an extension, e.g. clangd.restart.",
                commands.length,
                commands.map((command, index) => renderCommand(draft, command, index)),
                "Add command",
                () => addListEntry(draft, "commands", { id: "" })
            ),
            section(
                "Terminals",
                "Commands sent to an integrated terminal.",
                terminals.length,
                terminals.map((terminal, index) => renderTerminal(draft, terminal, index)),
                "Add terminal",
                () => addListEntry(draft, "terminals", { command: "" })
            ),
            section(
                "Processes",
                "Background processes whose output is shown in an editor tab.",
                processes.length,
                processes.map((process, index) => renderProcess(draft, process, index)),
                "Add process",
                () => {
                    draft.processLines.push("");
                    addListEntry(draft, "processes", { command: { call: [] } });
                }
            ),
            section(
                "Debug session",
                "A launch configuration from launch.json. An action group has at most one.",
                config.debugSession ? 1 : 0,
                config.debugSession ? [renderDebugSession(draft)] : [],
                config.debugSession ? undefined : "Add debug session",
                () => {
                    config.debugSession = {};
                    render();
                }
            ),
        ];
        const sectionKeys = ["tasks", "commands", "terminals", "processes", "debugSession"];
        sections.forEach((element, index) => element.setAttribute("data-section", sectionKeys[index]));

        main.append(
            el(
                "div",
                { class: "form" },
                el(
                    "header",
                    { class: "form-header" },
                    heading,
                    el("div", { class: "subtitle" }, draft.isNew ? "Not saved yet" : targetLabel(draft.targetId))
                ),
                ...banners,
                el(
                    "section",
                    { class: "section general" },
                    el(
                        "div",
                        { class: "row" },
                        field("Name", nameInput, undefined, true),
                        storageField
                    ),
                    el(
                        "div",
                        { class: "row" },
                        field("Group folder", folderInput, 'Folder in the Execute Action Group list. Separate levels with "/", e.g. Backend/Build.', true),
                        field("Sorting index", sortingInput, "Lower numbers come first.")
                    )
                ),
                ...sections,
                ...datalists
            ),
            el(
                "footer",
                { class: "actions" },
                !draft.isNew && button("Delete group", "secondary danger", () => deleteGroup(draft)),
                !draft.isNew && button("Open settings JSON", "link", () => vscodeApi.postMessage({ type: "openSettings", targetId: draft.targetId })),
                el("span", { class: "spacer" }),
                status,
                revertButton,
                saveButton
            )
        );
        refreshStatus();
    }

    function render() {
        renderMain();
        renderSidebar();
    }

    // ---------------------------------------------------------------- messages

    window.addEventListener("message", (event: MessageEvent<ExtensionMessage>) => {
        const message = event.data;
        switch (message.type) {
            case "state":
                state = message.state;
                reconcileDrafts();
                render();
                break;
            case "newGroup":
                createNewGroup();
                break;
            case "result": {
                const draftId = pendingRequests.get(message.requestId);
                pendingRequests.delete(message.requestId);
                const draft = draftId ? drafts.get(draftId) : undefined;
                if (message.result.ok && draftId) {
                    const wasDelete = message.result.select === undefined;
                    drafts.delete(draftId);
                    selectedId = message.result.select;
                    statusMessage = wasDelete ? "" : "Saved";
                } else if (draft) {
                    draft.error = message.result.error;
                    statusMessage = "";
                }
                state = message.state;
                reconcileDrafts();
                render();
                break;
            }
        }
    });

    window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            const draft = getDraft(selectedId);
            if (draft && isDirty(draft)) {
                save(draft);
            }
        }
    });

    render();
    vscodeApi.postMessage({ type: "ready" });
})();

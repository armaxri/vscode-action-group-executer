import * as assert from "assert";
import { afterEach } from "mocha";
import * as vscode from "vscode";

import { EIActionGroup } from "../../configuration";
import { getSettingsTargets, SettingsTarget } from "../../actionGroupSettings";
import { ActionGroupEditorController } from "../../actionGroupEditor";
import { SaveRequest } from "../../actionGroupEditorProtocol";

suite('ActionGroup Extension "action group editor" Test Suite', () => {
    let workspaceTarget: SettingsTarget;
    let userTarget: SettingsTarget;
    let originalWorkspaceGroups: Array<EIActionGroup>;
    let originalUserGroups: Array<EIActionGroup>;
    let confirmAnswers: Array<boolean>;
    let confirmMessages: Array<string>;
    let controller: ActionGroupEditorController;

    function getTarget(configurationTarget: vscode.ConfigurationTarget) {
        const target = getSettingsTargets().find(
            (target) => target.configurationTarget === configurationTarget
        );
        assert.ok(target, `Settings target ${configurationTarget} missing.`);
        return target;
    }

    suiteSetup(() => {
        workspaceTarget = getTarget(vscode.ConfigurationTarget.Workspace);
        userTarget = getTarget(vscode.ConfigurationTarget.Global);
        originalWorkspaceGroups = workspaceTarget.readGroups();
        originalUserGroups = userTarget.readGroups();
    });

    setup(() => {
        confirmAnswers = [];
        confirmMessages = [];
        controller = new ActionGroupEditorController(async (message) => {
            confirmMessages.push(message);
            const answer = confirmAnswers.shift();
            assert.ok(answer !== undefined, `Unexpected confirmation "${message}".`);
            return answer;
        });
    });

    afterEach(async () => {
        await workspaceTarget.writeGroups(originalWorkspaceGroups);
        await userTarget.writeGroups(originalUserGroups);
    });

    function findStored(target: SettingsTarget, name: string) {
        return target.readGroups().find((group) => group.name === name);
    }

    async function seedGroups(...groups: Array<EIActionGroup>) {
        await workspaceTarget.writeGroups([...originalWorkspaceGroups, ...groups]);
    }

    async function getEditorGroup(name: string) {
        const state = await controller.getState();
        const group = state.groups.find((group) => group.config.name === name);
        assert.ok(group, `Group "${name}" missing in the editor state.`);
        return group;
    }

    function newGroupRequest(config: EIActionGroup, extra: Partial<SaveRequest> = {}): SaveRequest {
        return {
            targetId: workspaceTarget.id,
            config: config,
            folderPath: "",
            processLines: (config.processes ?? []).map(() => ""),
            ...extra,
        };
    }

    const seedGroup: EIActionGroup = {
        name: "Seed group",
        sortingIndex: 5,
        groupNames: [{ name: "Backend", sortingIndex: 3 }],
        tasks: [{ name: "integration echo", delayTask: 10 }],
        terminals: [{ command: "echo old", showTerminal: false }],
        processes: [
            {
                name: "Seed process",
                command: { call: ["ls", "with space"], extendedOptions: { cwd: "/tmp" } },
            },
            {
                commands: [{ call: ["echo", "1"] }, { call: ["echo", "2"] }],
            } as any,
        ],
    };

    test("provides the settings locations and stored groups", async () => {
        await seedGroups(seedGroup);
        const state = await controller.getState();

        assert.deepStrictEqual(
            state.targets.map((target) => target.label),
            ["Workspace Settings", "User Settings"]
        );
        const group = state.groups.find((group) => group.config.name === "Seed group");
        assert.ok(group);
        assert.strictEqual(group.targetId, workspaceTarget.id);
        assert.strictEqual(group.id, `${workspaceTarget.id}#${originalWorkspaceGroups.length}`);
        assert.strictEqual(group.folderPath, "Backend");
        assert.deepStrictEqual(group.processLines, ['ls "with space"', null]);
    });

    test("offers the real tasks, commands and launch configurations", async () => {
        const choices = (await controller.getState()).choices;

        assert.ok(
            choices.tasks.some(
                (task) =>
                    task.name === "integration echo" &&
                    task.source === "Workspace" &&
                    task.folder === "workspace"
            ),
            JSON.stringify(choices.tasks)
        );
        // Contributed commands are offered with their title, even before activation.
        assert.ok(
            choices.commands.some(
                (command) =>
                    command.id === "action-group-executer.killAllProcesses" &&
                    command.title === "ActionGroupExec: Kill all Background Processes"
            )
        );
        assert.ok(choices.commands.some((command) => command.id === "workbench.action.files.saveAll"));
        assert.deepStrictEqual(
            choices.launches.filter((launch) => launch.name === "Integration launch"),
            [{ name: "Integration launch", folder: "workspace", location: "workspace", detail: "node · launch" }]
        );
        assert.strictEqual(choices.multiRoot, false);
    });

    test("creates a group with all kinds of actions", async () => {
        const result = await controller.save(
            newGroupRequest(
                {
                    name: "  Editor group  ",
                    tasks: [{ name: "integration echo", delayTask: 250 }],
                    commands: [{ id: "actionGroupExecuterTest.record", args: ["a", 1] }],
                    terminals: [{ command: "echo hi", alwaysNewTerminal: true }],
                    processes: [{ name: "Lister", command: { call: [], delayProcess: 100 } }],
                    debugSession: { namedConfiguration: "Integration launch" },
                },
                { folderPath: " Tools / Build ", processLines: ['ls -la "my dir"'] }
            )
        );

        assert.deepStrictEqual(result, {
            ok: true,
            select: `${workspaceTarget.id}#${originalWorkspaceGroups.length}`,
        });
        assert.deepStrictEqual(findStored(workspaceTarget, "Editor group"), {
            name: "Editor group",
            groupNames: [{ name: "Tools" }, { name: "Build" }],
            tasks: [{ name: "integration echo", delayTask: 250 }],
            commands: [{ id: "actionGroupExecuterTest.record", args: ["a", 1] }],
            terminals: [{ command: "echo hi", alwaysNewTerminal: true }],
            processes: [{ name: "Lister", command: { call: ["ls", "-la", "my dir"], delayProcess: 100 } }],
            debugSession: { namedConfiguration: "Integration launch" },
        });
    });

    test("rejects invalid groups without saving", async () => {
        const cases: Array<[SaveRequest, string]> = [
            [newGroupRequest({ name: " ", terminals: [{ command: "echo" }] }), "The action group needs a name."],
            [newGroupRequest({ name: "Empty", tasks: [] }), "Add at least one action."],
            [newGroupRequest({ name: "No task", tasks: [{ name: "" }] }), "Select a task for every task entry."],
            [newGroupRequest({ name: "No command", commands: [{ id: " " }] }), "Enter a command for every command entry."],
            [
                newGroupRequest({ name: "Bad args", commands: [{ id: "x", args: "nope" as any }] }),
                "Command arguments must be a JSON array.",
            ],
            [newGroupRequest({ name: "No terminal", terminals: [{ command: "" }] }), "Enter a command for every terminal."],
            [
                newGroupRequest({ name: "No process", processes: [{ command: { call: [] } }] }, { processLines: ["  "] }),
                "Enter a command line for every process.",
            ],
            [
                newGroupRequest({ name: "No launch", debugSession: {} }),
                "Select a launch configuration for the debug session.",
            ],
        ];
        for (const [request, error] of cases) {
            assert.deepStrictEqual(await controller.save(request), { ok: false, error: error });
        }
        assert.deepStrictEqual(workspaceTarget.readGroups(), originalWorkspaceGroups);
    });

    test("saves changes in place and keeps settings the editor does not show", async () => {
        await seedGroups(seedGroup);
        const group = await getEditorGroup("Seed group");

        const config = JSON.parse(JSON.stringify(group.config)) as EIActionGroup;
        config.name = "Renamed group";
        config.tasks = [{ name: "integration fail" }];
        delete config.terminals;
        const result = await controller.save({
            id: group.id,
            original: group.config,
            targetId: group.targetId,
            config: config,
            folderPath: group.folderPath,
            processLines: ["ls -l", null],
        });

        assert.deepStrictEqual(result, { ok: true, select: group.id });
        assert.strictEqual(findStored(workspaceTarget, "Seed group"), undefined);
        assert.deepStrictEqual(findStored(workspaceTarget, "Renamed group"), {
            name: "Renamed group",
            sortingIndex: 5,
            groupNames: [{ name: "Backend", sortingIndex: 3 }],
            tasks: [{ name: "integration fail" }],
            processes: [
                { name: "Seed process", command: { call: ["ls", "-l"], extendedOptions: { cwd: "/tmp" } } },
                { commands: [{ call: ["echo", "1"] }, { call: ["echo", "2"] }] },
            ],
        });
    });

    test("reuses the sorting index of existing group folders", async () => {
        await seedGroups({ ...seedGroup, groupNames: [{ name: "Backend", sortingIndex: 3 }, { name: "Server", sortingIndex: 7 }] });

        await controller.save(
            newGroupRequest({ name: "Folder test", terminals: [{ command: "echo" }] }, { folderPath: "Backend/Server/Extra" })
        );
        assert.deepStrictEqual(findStored(workspaceTarget, "Folder test")?.groupNames, [
            { name: "Backend", sortingIndex: 3 },
            { name: "Server", sortingIndex: 7 },
            { name: "Extra" },
        ]);
    });

    test("moves a group to another settings location", async () => {
        await seedGroups(seedGroup);
        const group = await getEditorGroup("Seed group");

        const result = await controller.save({
            id: group.id,
            original: group.config,
            targetId: userTarget.id,
            config: group.config,
            folderPath: group.folderPath,
            processLines: group.processLines,
        });

        assert.deepStrictEqual(result, { ok: true, select: `${userTarget.id}#${originalUserGroups.length}` });
        assert.strictEqual(findStored(workspaceTarget, "Seed group"), undefined);
        assert.deepStrictEqual(findStored(userTarget, "Seed group"), seedGroup);
    });

    test("does not overwrite changes made outside the editor", async () => {
        await seedGroups(seedGroup);
        const group = await getEditorGroup("Seed group");
        await seedGroups({ ...seedGroup, sortingIndex: 99 });

        const result = await controller.save({
            id: group.id,
            original: group.config,
            targetId: group.targetId,
            config: { ...group.config, name: "Renamed" },
            folderPath: group.folderPath,
            processLines: group.processLines,
        });

        assert.strictEqual(result.ok, false);
        assert.ok(result.error?.includes("in the meantime"), result.error);
        assert.strictEqual(findStored(workspaceTarget, "Seed group")?.sortingIndex, 99);
        assert.strictEqual(findStored(workspaceTarget, "Renamed"), undefined);
    });

    test("deletes a group only after confirmation", async () => {
        await seedGroups(seedGroup);
        const group = await getEditorGroup("Seed group");

        confirmAnswers = [false];
        assert.deepStrictEqual(await controller.delete({ id: group.id, original: group.config }), { ok: false });
        assert.ok(findStored(workspaceTarget, "Seed group"));

        confirmAnswers = [true];
        assert.deepStrictEqual(await controller.delete({ id: group.id, original: group.config }), { ok: true });
        assert.strictEqual(findStored(workspaceTarget, "Seed group"), undefined);
        assert.deepStrictEqual(confirmMessages, [
            'Delete the action group "Seed group" from the Workspace Settings?',
            'Delete the action group "Seed group" from the Workspace Settings?',
        ]);
    });

    test("opens the editor as a webview tab", async () => {
        await vscode.commands.executeCommand("action-group-executer.editActionGroups");
        const findEditorTab = () =>
            vscode.window.tabGroups.all
                .flatMap((group) => group.tabs)
                .find(
                    (tab) =>
                        tab.input instanceof vscode.TabInputWebview &&
                        tab.input.viewType.endsWith("actionGroupExecuter.editor")
                );
        // The tab model is updated asynchronously.
        for (let i = 0; i < 50 && !findEditorTab(); ++i) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const tab = findEditorTab();
        const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
        assert.ok(
            tab,
            `Editor tab not found in: ${tabs.map((tab) => `${tab.label} (${(tab.input as any)?.viewType})`).join(", ")}`
        );
        assert.strictEqual(tab.label, "Action Groups");

        // Running the command again reuses the open editor.
        await vscode.commands.executeCommand("action-group-executer.createActionGroup");
        const editorTabs = vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .filter((tab) => tab.input instanceof vscode.TabInputWebview);
        assert.strictEqual(editorTabs.length, 1);

        await vscode.window.tabGroups.close(tab);
        assert.strictEqual(findEditorTab(), undefined);
    });
});

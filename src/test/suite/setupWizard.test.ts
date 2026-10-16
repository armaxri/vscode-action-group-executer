import * as assert from "assert";
import { afterEach } from "mocha";
import * as vscode from "vscode";

import { EIActionGroup } from "../../configuration";
import {
    getSettingsTargets,
    SettingsTarget,
} from "../../actionGroupSettings";
import {
    createActionGroupWizard,
    deleteActionGroupWizard,
    editActionGroupWizard,
} from "../../setupWizard";
import { ScriptedWizardUI, WizardStep } from "./testHelpers";

suite('ActionGroup Extension "setup wizard" Test Suite', () => {
    let workspaceTarget: SettingsTarget;
    let originalGroups: Array<EIActionGroup>;

    suiteSetup(() => {
        const target = getSettingsTargets().find(
            (target) =>
                target.configurationTarget ===
                vscode.ConfigurationTarget.Workspace
        );
        assert.ok(target, "Workspace settings target missing.");
        workspaceTarget = target;
        originalGroups = workspaceTarget.readGroups();
    });

    afterEach(async () => {
        await workspaceTarget.writeGroups(originalGroups);
    });

    async function runWizard(
        wizard: (ui: ScriptedWizardUI) => Promise<void>,
        steps: Array<WizardStep>
    ) {
        const ui = new ScriptedWizardUI(steps);
        await wizard(ui);
        ui.assertFinished();
        return ui;
    }

    function findGroup(name: string) {
        return workspaceTarget.readGroups().find((group) => group.name === name);
    }

    async function seedGroups(...groups: Array<EIActionGroup>) {
        await workspaceTarget.writeGroups([...originalGroups, ...groups]);
    }

    test("lists the targets of a single folder workspace", () => {
        assert.deepStrictEqual(
            getSettingsTargets().map((target) => target.label),
            ["Workspace Settings", "User Settings"]
        );
    });

    test("creates an action group with all kinds of actions", async () => {
        const ui = await runWizard(createActionGroupWizard, [
            { input: "Wizard group" },
            // The first action is requested directly after the name.
            { pick: "Task…" },
            { pick: "integration echo" },
            { input: "abc", invalid: true },
            { input: "250" },
            { pick: "Add action…" },
            { pick: "VS Code command…" },
            { pick: "Enter manually…" },
            { input: "actionGroupExecuterTest.record" },
            { input: "no json", invalid: true },
            { input: '{"not": "an array"}', invalid: true },
            { input: '["a", 1]' },
            { input: "" },
            { pick: "Add action…" },
            { pick: "Terminal…" },
            { input: "", invalid: true },
            { input: "echo hi" },
            { input: "" },
            { pickMany: ["Show terminal", "Always new terminal"] },
            { input: "" },
            { pick: "Add action…" },
            { pick: "Process…" },
            { input: 'ls -la "my dir"' },
            { input: "Lister" },
            { input: "100" },
            { pick: "Add action…" },
            { pick: "Debug session…" },
            { pick: "Integration launch" },
            { input: "" },
            { pick: "Group folder" },
            { pick: "New folder…" },
            { input: " Tools / Build " },
            { pick: "Save…" },
            { pick: "Workspace Settings" },
        ]);

        assert.deepStrictEqual(findGroup("Wizard group"), {
            name: "Wizard group",
            tasks: [{ name: "integration echo", delayTask: 250 }],
            commands: [
                { id: "actionGroupExecuterTest.record", args: ["a", 1] },
            ],
            terminals: [{ command: "echo hi", alwaysNewTerminal: true }],
            processes: [
                {
                    name: "Lister",
                    command: { call: ["ls", "-la", "my dir"], delayProcess: 100 },
                },
            ],
            debugSession: { namedConfiguration: "Integration launch" },
            groupNames: [{ name: "Tools" }, { name: "Build" }],
        });
        assert.deepStrictEqual(ui.infos, [
            'Saved the action group "Wizard group" to the Workspace Settings.',
        ]);
        assert.deepStrictEqual(ui.warnings, []);
    });

    test("offers the real tasks, commands and launch configurations", async () => {
        const ui = await runWizard(createActionGroupWizard, [
            { input: "Choices" },
            { pick: "Task…" },
            { cancel: true },
            { pick: "Add action…" },
            { pick: "VS Code command…" },
            { pick: "ActionGroupExec: Kill all Background Processes" },
            { input: "" },
            { input: "" },
            { pick: "Add action…" },
            { pick: "Debug session…" },
            { cancel: true },
            { pick: "Save…" },
            { pick: "Workspace Settings" },
        ]);

        const taskItems = ui.pickedFrom[1].map(
            (item) => `${item.label} [${item.description}]`
        );
        assert.ok(taskItems.includes("integration echo [Workspace · workspace]"), taskItems.join());
        assert.ok(taskItems.includes("integration fail [Workspace · workspace]"), taskItems.join());

        const launchItems = ui.pickedFrom[7].map((item) => item.label);
        assert.ok(launchItems.includes("Integration launch"), launchItems.join());

        // Commands are stored by their ID, even when selected by title.
        assert.deepStrictEqual(findGroup("Choices")?.commands, [
            { id: "action-group-executer.killAllProcesses" },
        ]);
    });

    test("reuses existing group folders with their sorting index", async () => {
        await seedGroups({
            name: "Existing",
            groupNames: [
                { name: "Backend", sortingIndex: 3 },
                { name: "Server", sortingIndex: 7 },
            ],
            terminals: [{ command: "echo existing" }],
        });

        await runWizard(createActionGroupWizard, [
            { input: "Folder test" },
            { pick: "Terminal…" },
            { input: "echo folder" },
            { input: "" },
            { pickMany: ["Show terminal"] },
            { input: "" },
            { pick: "Group folder" },
            { pick: "$(folder) Backend" },
            { pick: "Group folder" },
            { pick: "New folder…" },
            { input: "Backend/Server/Extra" },
            { pick: "Save…" },
            { pick: "Workspace Settings" },
        ]);

        assert.deepStrictEqual(findGroup("Folder test")?.groupNames, [
            { name: "Backend", sortingIndex: 3 },
            { name: "Server", sortingIndex: 7 },
            { name: "Extra" },
        ]);
    });

    test("refuses to save an action group without actions", async () => {
        const ui = await runWizard(createActionGroupWizard, [
            { input: "Empty" },
            { cancel: true },
            { pick: "Save…" },
            // Nothing changed, so cancelling needs no confirmation.
            { cancel: true },
        ]);
        assert.deepStrictEqual(ui.warnings, [
            "Add at least one action before saving.",
        ]);
        assert.strictEqual(findGroup("Empty"), undefined);
    });

    test("cancelling the save location returns to the menu", async () => {
        await runWizard(createActionGroupWizard, [
            { input: "Not saved" },
            { pick: "Terminal…" },
            { input: "echo hi" },
            { input: "" },
            { pickMany: [] },
            { input: "" },
            { pick: "Save…" },
            { cancel: true },
            { cancel: true },
            { confirm: true },
        ]);
        assert.strictEqual(findGroup("Not saved"), undefined);
    });

    const seedGroup: EIActionGroup = {
        name: "Seed group",
        sortingIndex: 5,
        tasks: [{ name: "integration echo", delayTask: 10 }],
        terminals: [{ command: "echo old", showTerminal: false }],
        processes: [
            {
                name: "Seed process",
                command: {
                    call: ["ls", "with space"],
                    extendedOptions: { cwd: "/tmp" },
                },
            },
        ],
    };

    test("edits an action group and keeps settings it does not manage", async () => {
        await seedGroups(seedGroup);

        const ui = await runWizard(editActionGroupWizard, [
            { pick: "Seed group" },
            { pick: "Task: integration echo" },
            { pick: "Edit" },
            { pick: "integration fail" },
            // The current delay is prefilled, an empty value removes it.
            { input: "" },
            { pick: "Terminal: echo old" },
            { pick: "Remove" },
            { pick: 'Process: ls "with space"' },
            { pick: "Edit" },
            { input: "ls -l" },
            { input: "Seed process" },
            { input: "" },
            { pick: "Name: Seed group" },
            { input: "Renamed group" },
            { pick: "Save changes" },
        ]);

        assert.strictEqual(findGroup("Seed group"), undefined);
        assert.deepStrictEqual(findGroup("Renamed group"), {
            name: "Renamed group",
            sortingIndex: 5,
            tasks: [{ name: "integration fail" }],
            processes: [
                {
                    name: "Seed process",
                    command: { call: ["ls", "-l"], extendedOptions: { cwd: "/tmp" } },
                },
            ],
        });
        assert.deepStrictEqual(ui.infos, ['Saved the action group "Renamed group".']);
    });

    test("prefills the current values when editing", async () => {
        await seedGroups(seedGroup);

        const ui = await runWizard(editActionGroupWizard, [
            { pick: "Seed group" },
            { pick: "Task: integration echo" },
            { pick: "Edit" },
            { cancel: true },
            { cancel: true },
        ]);
        const taskItems = ui.pickedFrom[3];
        assert.strictEqual(taskItems[0].label, "integration echo");
        assert.ok(taskItems[0].description?.includes("(current)"));
    });

    test("discarding changes keeps the stored action group", async () => {
        await seedGroups(seedGroup);

        await runWizard(editActionGroupWizard, [
            { pick: "Seed group" },
            { pick: "Name: Seed group" },
            { input: "Changed" },
            { cancel: true },
            { confirm: false },
            { cancel: true },
            { confirm: true },
        ]);
        assert.deepStrictEqual(findGroup("Seed group"), seedGroup);
    });

    test("does not overwrite changes made while editing", async () => {
        await seedGroups(seedGroup);

        const ui = await runWizard(editActionGroupWizard, [
            { pick: "Seed group" },
            { pick: "Name: Seed group" },
            { input: "Renamed" },
            {
                pick: "Save changes",
                before: () =>
                    seedGroups({ ...seedGroup, sortingIndex: 99 }),
            },
        ]);
        assert.strictEqual(ui.warnings.length, 1);
        assert.ok(ui.warnings[0].includes("in the meantime"), ui.warnings[0]);
        assert.strictEqual(findGroup("Seed group")?.sortingIndex, 99);
        assert.strictEqual(findGroup("Renamed"), undefined);
    });

    test("deletes an action group after confirmation", async () => {
        await seedGroups(seedGroup);

        await runWizard(deleteActionGroupWizard, [
            { pick: "Seed group" },
            { confirm: false },
        ]);
        assert.ok(findGroup("Seed group"));

        const ui = await runWizard(deleteActionGroupWizard, [
            { pick: "Seed group" },
            { confirm: true },
        ]);
        assert.strictEqual(findGroup("Seed group"), undefined);
        assert.deepStrictEqual(workspaceTarget.readGroups(), originalGroups);
        assert.deepStrictEqual(ui.infos, ['Deleted the action group "Seed group".']);
    });

    test("deletes an action group from the edit menu", async () => {
        await seedGroups(seedGroup);

        await runWizard(editActionGroupWizard, [
            { pick: "Seed group" },
            { pick: "Delete action group" },
            { confirm: true },
        ]);
        assert.strictEqual(findGroup("Seed group"), undefined);
    });
});

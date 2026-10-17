import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

import { ActionGroup, getActionGroups } from "../../configuration";
import { runTaskAction } from "../../task";
import { runCommandAction } from "../../vscodeCommand";
import { TaskRunRecorder } from "./testHelpers";

// Reads the action group from the fixture workspace settings and runs its tasks and commands.
suite('ActionGroup Extension "tasks and commands settings" Test Suite', () => {
    const recordedArgs = new Array<Array<any>>();
    let registration: vscode.Disposable;
    let actionGroup: ActionGroup;

    suiteSetup(() => {
        registration = vscode.commands.registerCommand(
            "actionGroupExecuterTest.record",
            (...args: Array<any>) => {
                recordedArgs.push(args);
            }
        );

        const found = getActionGroups().find(
            (item) =>
                item instanceof ActionGroup &&
                item.name === "Integration tasks and commands"
        );
        assert.ok(found instanceof ActionGroup, "Action group not found.");
        actionGroup = found;
    });

    suiteTeardown(() => {
        registration.dispose();
    });

    test("parses tasks with variable substitution", () => {
        assert.strictEqual(actionGroup.tasks.length, 1);
        const task = actionGroup.tasks[0];
        assert.strictEqual(task.name, "integration echo");
        assert.strictEqual(task.source, "Workspace");
        assert.strictEqual(task.workspaceName, "workspace");
        assert.strictEqual(task.delayTask, 10);
    });

    test("parses commands with variable substitution", () => {
        assert.strictEqual(actionGroup.commands.length, 1);
        const command = actionGroup.commands[0];
        assert.strictEqual(command.id, "actionGroupExecuterTest.record");
        assert.deepStrictEqual(command.args, [
            "workspace",
            42,
            { nested: path.sep },
        ]);
        assert.strictEqual(command.delayCommand, 20);
    });

    test("runs the configured task and command", async () => {
        const recorder = new TaskRunRecorder();
        try {
            await Promise.all([
                ...actionGroup.tasks.map((task) =>
                    runTaskAction(task, actionGroup.selectedWorkspace)
                ),
                ...actionGroup.commands.map((command) =>
                    runCommandAction(command)
                ),
            ]);
            const run = await recorder.waitForRun("integration echo");
            assert.strictEqual(run.exitCode, 0);
            assert.deepStrictEqual(recordedArgs, [
                ["workspace", 42, { nested: path.sep }],
            ]);
        } finally {
            recorder.dispose();
        }
    });
});

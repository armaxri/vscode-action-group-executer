import * as assert from "assert";
import { beforeEach, afterEach } from "mocha";
import * as vscode from "vscode";

import { TaskAction } from "../../configuration";
import { runTaskAction } from "../../task";
import { captureErrorMessages, TaskRunRecorder } from "./testHelpers";

suite('ActionGroup Extension "task" Test Suite', () => {
    let recorder: TaskRunRecorder;
    let workspaceFolder: vscode.WorkspaceFolder;

    suiteSetup(() => {
        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders && folders.length === 1, "Test workspace missing.");
        workspaceFolder = folders[0];
    });

    beforeEach(() => {
        recorder = new TaskRunRecorder();
    });

    afterEach(() => {
        recorder.dispose();
    });

    test("TaskAction defaults", () => {
        const taskAction = new TaskAction({ name: "build" });
        assert.strictEqual(taskAction.name, "build");
        assert.strictEqual(taskAction.source, undefined);
        assert.strictEqual(taskAction.workspaceName, undefined);
        assert.strictEqual(taskAction.delayTask, 0);
    });

    test("runs a tasks.json task by name", async () => {
        const errors = await captureErrorMessages(() =>
            runTaskAction(
                new TaskAction({ name: "integration echo" }),
                workspaceFolder
            )
        );
        assert.deepStrictEqual(errors, []);
        const run = await recorder.waitForRun("integration echo");
        assert.strictEqual(run.exitCode, 0);
    });

    test("runs the task matching the name", async () => {
        await runTaskAction(
            new TaskAction({ name: "integration fail" }),
            workspaceFolder
        );
        const run = await recorder.waitForRun("integration fail");
        assert.strictEqual(run.exitCode, 3);
    });

    test("finds the task without a selected workspace", async () => {
        await runTaskAction(new TaskAction({ name: "integration echo" }), null);
        const run = await recorder.waitForRun("integration echo");
        assert.strictEqual(run.exitCode, 0);
    });

    test("runs the task with a matching source", async () => {
        await runTaskAction(
            new TaskAction({ name: "integration echo", source: "Workspace" }),
            workspaceFolder
        );
        const run = await recorder.waitForRun("integration echo");
        assert.strictEqual(run.exitCode, 0);
    });

    test("runs the task with a matching workspace name", async () => {
        await runTaskAction(
            new TaskAction({
                name: "integration echo",
                workspaceName: workspaceFolder.name,
            }),
            null
        );
        const run = await recorder.waitForRun("integration echo");
        assert.strictEqual(run.exitCode, 0);
    });

    test("delays the task start", async () => {
        const callTime = Date.now();
        await runTaskAction(
            new TaskAction({ name: "integration echo", delayTask: 500 }),
            workspaceFolder
        );
        const run = await recorder.waitForRun("integration echo");
        assert.ok(
            run.startTime - callTime >= 500,
            `Task started after ${run.startTime - callTime} ms.`
        );
    });

    test("shows an error for an unknown task name", async () => {
        const errors = await captureErrorMessages(() =>
            runTaskAction(
                new TaskAction({ name: "does not exist" }),
                workspaceFolder
            )
        );
        assert.deepStrictEqual(errors, ['No task "does not exist" found.']);
        assert.deepStrictEqual(recorder.runs, []);
    });

    test("shows an error for a non matching source", async () => {
        const errors = await captureErrorMessages(() =>
            runTaskAction(
                new TaskAction({ name: "integration echo", source: "npm" }),
                workspaceFolder
            )
        );
        assert.deepStrictEqual(errors, [
            'No task "integration echo" with source "npm" found.',
        ]);
        assert.deepStrictEqual(recorder.runs, []);
    });

    test("shows an error for an unknown workspace name", async () => {
        const errors = await captureErrorMessages(() =>
            runTaskAction(
                new TaskAction({
                    name: "integration echo",
                    workspaceName: "unknownFolder",
                }),
                workspaceFolder
            )
        );
        assert.deepStrictEqual(errors, [
            'No workspace with the name "unknownFolder" was found.',
        ]);
        assert.deepStrictEqual(recorder.runs, []);
    });
});

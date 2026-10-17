import * as assert from "assert";
import { beforeEach } from "mocha";
import * as vscode from "vscode";

import { CommandAction } from "../../configuration";
import { runCommandAction } from "../../vscodeCommand";
import { captureErrorMessages } from "./testHelpers";

suite('ActionGroup Extension "vscodeCommand" Test Suite', () => {
    const recordedCalls = new Array<{ time: number; args: Array<any> }>();
    const registrations = new Array<vscode.Disposable>();

    suiteSetup(() => {
        registrations.push(
            vscode.commands.registerCommand(
                "actionGroupExecuterTest.record",
                (...args: Array<any>) => {
                    recordedCalls.push({ time: Date.now(), args: args });
                }
            ),
            vscode.commands.registerCommand(
                "actionGroupExecuterTest.throw",
                () => {
                    throw new Error("expected failure");
                }
            )
        );
    });

    suiteTeardown(() => {
        registrations.forEach((registration) => registration.dispose());
    });

    beforeEach(() => {
        recordedCalls.length = 0;
    });

    test("CommandAction defaults", () => {
        const commandAction = new CommandAction({ id: "some.command" });
        assert.strictEqual(commandAction.id, "some.command");
        assert.deepStrictEqual(commandAction.args, []);
        assert.strictEqual(commandAction.delayCommand, 0);
    });

    test("executes a command without arguments", async () => {
        const errors = await captureErrorMessages(() =>
            runCommandAction(
                new CommandAction({ id: "actionGroupExecuterTest.record" })
            )
        );
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(recordedCalls.length, 1);
        assert.deepStrictEqual(recordedCalls[0].args, []);
    });

    test("passes arguments to the command", async () => {
        await runCommandAction(
            new CommandAction({
                id: "actionGroupExecuterTest.record",
                args: ["text", 7, { key: true }],
            })
        );
        assert.strictEqual(recordedCalls.length, 1);
        assert.deepStrictEqual(recordedCalls[0].args, [
            "text",
            7,
            { key: true },
        ]);
    });

    test("delays the command execution", async () => {
        const callTime = Date.now();
        await runCommandAction(
            new CommandAction({
                id: "actionGroupExecuterTest.record",
                delayCommand: 300,
            })
        );
        assert.strictEqual(recordedCalls.length, 1);
        assert.ok(
            recordedCalls[0].time - callTime >= 300,
            `Command executed after ${recordedCalls[0].time - callTime} ms.`
        );
    });

    test("executes built-in VS Code commands", async () => {
        const errors = await captureErrorMessages(() =>
            runCommandAction(
                new CommandAction({ id: "workbench.action.closeAllEditors" })
            )
        );
        assert.deepStrictEqual(errors, []);
    });

    test("accepts commands of extensions that are not activated yet", async () => {
        const errors = await captureErrorMessages(() =>
            runCommandAction(
                new CommandAction({
                    id: "action-group-executer.killAllProcesses",
                })
            )
        );
        assert.deepStrictEqual(errors, []);
    });

    test("shows an error for an unknown command", async () => {
        const errors = await captureErrorMessages(() =>
            runCommandAction(new CommandAction({ id: "does.not.exist" }))
        );
        assert.deepStrictEqual(errors, [
            'No VS Code command "does.not.exist" found.',
        ]);
    });

    test("shows an error when the command fails", async () => {
        const errors = await captureErrorMessages(() =>
            runCommandAction(
                new CommandAction({ id: "actionGroupExecuterTest.throw" })
            )
        );
        assert.strictEqual(errors.length, 1);
        assert.ok(
            errors[0].startsWith(
                'Executing VS Code command "actionGroupExecuterTest.throw" failed:'
            ),
            errors[0]
        );
        assert.ok(errors[0].includes("expected failure"), errors[0]);
    });
});

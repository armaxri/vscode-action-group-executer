import * as assert from "assert";

import { ProcessAction } from "../../configuration";

suite('ActionGroup Extension "configuration" Test Suite', () => {
    const debugTemplate = { type: "node", request: "launch", name: "" };

    test("converts a process without extendedOptions to a debug session", () => {
        const processAction = new ProcessAction(
            { name: "Plain", command: { call: ["node", "app.js", "--flag"] } },
            "",
            "plaintext",
            "Group",
            { ...debugTemplate }
        );
        assert.ok(processAction.isConvertible2Debug());
        const debugSession = processAction.convert2DebugSession();
        assert.strictEqual(debugSession?.newConfiguration?.program, "node");
        assert.deepStrictEqual(debugSession?.newConfiguration?.args, [
            "app.js",
            "--flag",
        ]);
        assert.strictEqual(debugSession?.newConfiguration?.cwd, undefined);
    });

    test("uses the process cwd for the debug session", () => {
        const processAction = new ProcessAction(
            {
                command: {
                    call: ["node", "app.js"],
                    extendedOptions: { cwd: "/some/dir" },
                },
            },
            "",
            "plaintext",
            "Group",
            { ...debugTemplate }
        );
        const debugSession = processAction.convert2DebugSession();
        assert.strictEqual(debugSession?.newConfiguration?.cwd, "/some/dir");
    });
});

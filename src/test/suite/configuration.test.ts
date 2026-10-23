import * as assert from "assert";

import {
    ActionGroup,
    ActionGroupPickGroup,
    GroupSource,
    ProcessAction,
    getNestedActionGroupItems,
} from "../../configuration";

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

    test("collects the action groups of all subgroups with their path", () => {
        const createGroup = (name: string, groupNames: Array<string>) =>
            new ActionGroup(
                {
                    name,
                    groupNames: groupNames.map((groupName) => ({
                        name: groupName,
                    })),
                },
                undefined,
                undefined,
                false,
                GroupSource.user
            );
        const backend = new ActionGroupPickGroup({
            name: "Backend",
            sortingIndex: 1,
        });
        [
            createGroup("Build", ["Backend"]),
            createGroup("Unit", ["Backend", "Tests"]),
            createGroup("Smoke", ["Backend", "Tests", "Quick"]),
        ].forEach((group) => {
            group.groupNames.shift();
            backend.recursivelyAddAction(group);
        });
        const topLevel = createGroup("Top", []);

        const nestedItems = getNestedActionGroupItems([backend, topLevel]);

        assert.deepStrictEqual(
            nestedItems.map((item) => [item.label, item.description]),
            [
                ["Build", "Backend"],
                ["Unit", "Backend / Tests"],
                ["Smoke", "Backend / Tests / Quick"],
            ]
        );
        assert.strictEqual(nestedItems[1].actionGroup.name, "Unit");
    });
});

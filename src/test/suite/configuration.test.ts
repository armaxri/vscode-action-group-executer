import * as assert from "assert";

import {
    ActionGroup,
    ActionGroupPickGroup,
    GroupSource,
    ProcessAction,
    findActionGroups,
    getNestedActionGroupItems,
    isActionGroupReference,
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

    // Top level of the group structure: Backend and Frontend folders, "Top" group.
    const createGroupStructure = () => {
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
        const frontend = new ActionGroupPickGroup({
            name: "Frontend",
            sortingIndex: 2,
        });
        const frontendUnit = createGroup("Unit", ["Frontend", "Tests"]);
        frontendUnit.groupNames.shift();
        frontend.recursivelyAddAction(frontendUnit);
        return [backend, frontend, createGroup("Top", [])];
    };

    test("collects the action groups of all subgroups with their path", () => {
        const [backend, , topLevel] = createGroupStructure();

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

    test("finds action groups by name and group path", () => {
        const structure = createGroupStructure();
        const find = (name: string, groupNames?: Array<string>) =>
            findActionGroups(structure, { name, groupNames }).map(
                (group) => group.name
            );

        assert.deepStrictEqual(find("Top"), ["Top"]);
        assert.deepStrictEqual(find("Smoke"), ["Smoke"]);
        assert.deepStrictEqual(find("Unit"), ["Unit", "Unit"]);
        assert.deepStrictEqual(find("Unit", ["Frontend", "Tests"]), ["Unit"]);
        assert.strictEqual(
            findActionGroups(structure, {
                name: "Unit",
                groupNames: ["Frontend", "Tests"],
            })[0],
            (structure[1] as ActionGroupPickGroup).groups[0].elements[0]
        );
        assert.deepStrictEqual(find("Top", []), ["Top"]);
        assert.deepStrictEqual(find("Smoke", ["Backend"]), []);
        assert.deepStrictEqual(find("Missing"), []);
        assert.deepStrictEqual(find("Build", ["Missing"]), []);
    });

    test("accepts only valid action group references", () => {
        assert.ok(isActionGroupReference({ name: "Build" }));
        assert.ok(
            isActionGroupReference({ name: "Unit", groupNames: ["Backend"] })
        );
        assert.ok(!isActionGroupReference(undefined));
        assert.ok(!isActionGroupReference({}));
        assert.ok(!isActionGroupReference({ name: 1 }));
        assert.ok(
            !isActionGroupReference({ name: "Unit", groupNames: "Backend" })
        );
    });
});

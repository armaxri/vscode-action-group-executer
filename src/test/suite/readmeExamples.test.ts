import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

import { ActionGroup, EIActionGroup, GroupSource } from "../../configuration";
import { countActions } from "../../actionGroupEditor";

// Keeps the configuration examples of the README complete and valid.
const root = path.resolve(__dirname, "../../..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const settingsSchema = packageJson.contributes.configuration[0].properties;
const groupSchema = settingsSchema["actionGroupExecuter.actionGroups"].items;

function parseJsonc(text: string) {
    var json = "";
    var inString = false;
    for (let i = 0; i < text.length; ++i) {
        const char = text[i];
        if (inString) {
            json += char;
            if (char === "\\") {
                json += text[++i];
            } else if (char === '"') {
                inString = false;
            }
        } else if (char === '"') {
            inString = true;
            json += char;
        } else if (char === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") {
                ++i;
            }
            json += "\n";
        } else {
            json += char;
        }
    }
    return JSON.parse(json);
}

interface Example {
    section: string;
    file: string;
    content: any;
}

function getExamples() {
    const examples = new Array<Example>();
    // Split into the "##" and "###" sections, examples may only reference each other within one.
    readme.split(/\n(?=##+ )/).forEach((sectionText) => {
        const section = sectionText.split("\n")[0];
        const blocks = sectionText.matchAll(/```jsonc\n([\s\S]*?)```/g);
        for (const block of blocks) {
            const firstLine = block[1].split("\n")[0];
            const file = /^\/\/ (.+)$/.exec(firstLine)?.[1];
            assert.ok(file, `Example in "${section}" doesn't name its file:\n${block[1]}`);
            examples.push({ section: section, file: file, content: parseJsonc(block[1]) });
        }
    });
    return examples;
}

function assertKnownKeys(value: any, schema: any, context: string) {
    assert.strictEqual(typeof value, "object", `${context} must be an object.`);
    Object.keys(value).forEach((key) =>
        assert.ok(key in schema.properties, `Unknown option "${key}" in ${context}.`)
    );
    (schema.required ?? []).forEach((key: string) =>
        assert.ok(key in value, `Missing required option "${key}" in ${context}.`)
    );
}

function assertListItems(list: any, schema: any, context: string) {
    if (list === undefined) {
        return;
    }
    assert.ok(Array.isArray(list), `${context} must be a list.`);
    list.forEach((item: any, index: number) =>
        assertKnownKeys(item, schema.items, `${context}[${index}]`)
    );
}

function assertValidGroup(group: EIActionGroup, context: string) {
    const properties = groupSchema.properties;
    assertKnownKeys(group, groupSchema, context);
    assert.ok(countActions(group) > 0, `${context} has no actions.`);

    assertListItems(group.groupNames, properties.groupNames, `${context}.groupNames`);
    assertListItems(group.tasks, properties.tasks, `${context}.tasks`);
    assertListItems(group.commands, properties.commands, `${context}.commands`);
    assertListItems(group.terminals, properties.terminals, `${context}.terminals`);
    assertListItems(group.processes, properties.processes, `${context}.processes`);
    group.processes?.forEach((process, index) => {
        const processSchema = properties.processes.items.properties;
        const processContext = `${context}.processes[${index}]`;
        assert.ok(
            !!process.command !== !!process.commands,
            `${processContext} needs either "command" or "commands".`
        );
        if (process.command) {
            assertKnownKeys(process.command, processSchema.command, `${processContext}.command`);
        }
        assertListItems(process.commands, processSchema.commands, `${processContext}.commands`);
    });
    if (group.debugSession) {
        assertKnownKeys(group.debugSession, properties.debugSession, `${context}.debugSession`);
        assert.ok(
            group.debugSession.namedConfiguration || group.debugSession.newConfiguration,
            `${context}.debugSession needs "namedConfiguration" or "newConfiguration".`
        );
    }

    // The extension must be able to read the group.
    new ActionGroup(group, "", "", false, GroupSource.workspace);
}

suite('ActionGroup Extension "README examples" Test Suite', () => {
    const examples = getExamples();

    test("finds the examples", () => {
        assert.ok(examples.length >= 10, `Only ${examples.length} examples found.`);
    });

    test("settings examples are complete and valid", () => {
        const settingsExamples = examples.filter((example) => /settings\.json|\.code-workspace/.test(example.file));
        assert.ok(settingsExamples.length > 0);
        settingsExamples.forEach((example) => {
            const context = `${example.section} (${example.file})`;
            Object.keys(example.content).forEach((key) =>
                assert.ok(key in settingsSchema, `Unknown setting "${key}" in ${context}.`)
            );
            const groups = example.content["actionGroupExecuter.actionGroups"];
            if (groups !== undefined) {
                assert.ok(Array.isArray(groups) && groups.length > 0, `No action groups in ${context}.`);
                groups.forEach((group: EIActionGroup, index: number) =>
                    assertValidGroup(group, `${context} group ${index}`)
                );
            }
        });
    });

    test("tasks.json and launch.json examples are complete", () => {
        examples.forEach((example) => {
            const context = `${example.section} (${example.file})`;
            if (example.file.endsWith("tasks.json")) {
                assert.strictEqual(example.content.version, "2.0.0", context);
                example.content.tasks.forEach((task: any) =>
                    assert.ok(task.label && task.type, `Task without label or type in ${context}.`)
                );
            }
            if (example.file.endsWith("launch.json")) {
                assert.strictEqual(example.content.version, "0.2.0", context);
                example.content.configurations.forEach((configuration: any) =>
                    assert.ok(
                        configuration.name && configuration.type && configuration.request,
                        `Launch configuration without name, type or request in ${context}.`
                    )
                );
            }
        });
    });

    test("keybinding examples run action groups of the same section", () => {
        const keybindingExamples = examples.filter((example) => example.file.endsWith("keybindings.json"));
        assert.ok(keybindingExamples.length > 0);
        keybindingExamples.forEach((example) => {
            const groups: Array<EIActionGroup> = examples
                .filter((other) => other.section === example.section)
                .flatMap((other) => other.content["actionGroupExecuter.actionGroups"] ?? []);
            example.content.forEach((keybinding: any) => {
                assert.strictEqual(keybinding.command, "action-group-executer.executeActionGroup");
                const args = keybinding.args;
                const defined = groups.some(
                    (group) =>
                        group.name === args.name &&
                        (args.groupNames === undefined ||
                            JSON.stringify(args.groupNames) ===
                                JSON.stringify((group.groupNames ?? []).map((groupName) => groupName.name)))
                );
                assert.ok(defined, `Keybinding for "${args.name}" doesn't match a group in "${example.section}".`);
            });
        });
    });

    test("referenced tasks and launch configurations are defined in the same section", () => {
        const sections = [...new Set(examples.map((example) => example.section))];
        sections.forEach((section) => {
            const sectionExamples = examples.filter((example) => example.section === section);
            const workspaceTasks = sectionExamples
                .filter((example) => example.file.endsWith("tasks.json"))
                .flatMap((example) => example.content.tasks.map((task: any) => task.label));
            const npmScripts = sectionExamples
                .filter((example) => example.file.endsWith("package.json"))
                .flatMap((example) => Object.keys(example.content.scripts ?? {}));
            const launches = sectionExamples
                .filter((example) => example.file.endsWith("launch.json"))
                .flatMap((example) => [
                    ...(example.content.configurations ?? []),
                    ...(example.content.compounds ?? []),
                ].map((entry: any) => entry.name));

            sectionExamples
                .flatMap((example) => example.content["actionGroupExecuter.actionGroups"] ?? [])
                .forEach((group: EIActionGroup) => {
                    group.tasks?.forEach((task) => {
                        const defined =
                            task.source === "npm"
                                ? npmScripts.includes(task.name)
                                : workspaceTasks.includes(task.name);
                        assert.ok(defined, `Task "${task.name}" of "${group.name}" isn't defined in "${section}".`);
                    });
                    const launch = group.debugSession?.namedConfiguration;
                    if (launch) {
                        assert.ok(
                            launches.includes(launch),
                            `Launch configuration "${launch}" of "${group.name}" isn't defined in "${section}".`
                        );
                    }
                });
        });
    });
});

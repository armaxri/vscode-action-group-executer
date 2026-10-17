import * as vscode from "vscode";

import { CommandAction } from "./configuration";
import { delay } from "./utils";

// Commands contributed by extensions with their titles. Commands of extensions that are not
// activated yet are not registered, but executing them activates the extension.
export function getContributedCommands() {
    const titles = new Map<string, string | undefined>();
    vscode.extensions.all.forEach((extension) => {
        const commands = extension.packageJSON?.contributes?.commands;
        const commandList = Array.isArray(commands)
            ? commands
            : commands
            ? [commands]
            : [];
        commandList.forEach((command: any) => {
            if (typeof command?.command !== "string") {
                return;
            }
            // Skip localized placeholders like "%command.title%".
            const isText = (value: unknown): value is string =>
                typeof value === "string" &&
                value !== "" &&
                !value.startsWith("%");
            const title = isText(command.title) ? command.title : undefined;
            const category = isText(command.category)
                ? `${command.category}: `
                : "";
            titles.set(command.command, title && category + title);
        });
    });
    return titles;
}

export async function runCommandAction(commandAction: CommandAction) {
    await delay(commandAction.delayCommand);

    const availableCommands = await vscode.commands.getCommands();
    if (
        !availableCommands.includes(commandAction.id) &&
        !getContributedCommands().has(commandAction.id)
    ) {
        console.log(`No VS Code command "${commandAction.id}" found.`);
        vscode.window.showErrorMessage(
            `No VS Code command "${commandAction.id}" found.`
        );
        return;
    }

    console.log(`Executing VS Code command "${commandAction.id}".`);
    try {
        await vscode.commands.executeCommand(
            commandAction.id,
            ...commandAction.args
        );
    } catch (error) {
        console.log(
            `Executing VS Code command "${commandAction.id}" failed: ${error}`
        );
        vscode.window.showErrorMessage(
            `Executing VS Code command "${commandAction.id}" failed: ${error}`
        );
    }
}

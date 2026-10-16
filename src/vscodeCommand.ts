import * as vscode from "vscode";

import { CommandAction } from "./configuration";
import { delay } from "./utils";

export async function runCommandAction(commandAction: CommandAction) {
    await delay(commandAction.delayCommand);

    const availableCommands = await vscode.commands.getCommands();
    if (!availableCommands.includes(commandAction.id)) {
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

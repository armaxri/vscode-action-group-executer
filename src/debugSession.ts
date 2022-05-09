import * as vscode from "vscode";

import { ActionGroup } from "./configuration";
import {
    delay,
    getWorkspaceFromName,
    splitArguments,
    ArgumentsInputBoxOptions,
} from "./utils";

export async function runDebugSession(actionGroup: ActionGroup) {
    if (!actionGroup.debugSession) {
        return;
    }

    var selectedWorkspace = actionGroup.selectedWorkspace;
    if (actionGroup.debugSession.workspaceName) {
        const fetchedWorkspaceFromName = getWorkspaceFromName(
            actionGroup.debugSession.workspaceName
        );
        if (!fetchedWorkspaceFromName) {
            return;
        }
        selectedWorkspace = fetchedWorkspaceFromName;
    }

    if (
        !actionGroup.debugSession.namedConfiguration &&
        !actionGroup.debugSession.newConfiguration
    ) {
        vscode.window.showErrorMessage(
            `Action group "${actionGroup.name}" has a debug session entry but no name of the configuration or a new configuration.`
        );
        return;
    }

    await delay(actionGroup.debugSession.delaySession);

    if (actionGroup.debugSession.namedConfiguration) {
        if (!selectedWorkspace) {
            vscode.window.showErrorMessage(
                `Action group "${actionGroup.name}" has a named debug session but is not executed in the context of a workspace.`
            );
            console.log(
                `Action group "${actionGroup.name}" has a named debug session but is not executed in the context of a workspace.`
            );
            return;
        }

        console.log(
            `Executing named debug configuration "${actionGroup.debugSession.namedConfiguration}" in workspace "${selectedWorkspace.name}".`
        );
        vscode.debug.startDebugging(
            selectedWorkspace,
            actionGroup.debugSession.namedConfiguration
        );
    } else if (actionGroup.debugSession.newConfiguration) {
        if (actionGroup.debugSession.requestUserInputArguments) {
            const additionalArgsString = await vscode.window.showInputBox(
                new ArgumentsInputBoxOptions()
            );
            if (additionalArgsString) {
                const additionalArgs = splitArguments(additionalArgsString);

                const args = actionGroup.debugSession.newConfiguration
                    .args as string[];
                additionalArgs.forEach((argument) => {
                    args.push(argument);
                });
            }
        }

        if (selectedWorkspace) {
            console.log(
                `Executing custom debug configuration in workspace "${selectedWorkspace.name}".`
            );
            vscode.debug.startDebugging(
                selectedWorkspace,
                actionGroup.debugSession.newConfiguration
            );
        } else {
            console.log(
                `Executing custom debug configuration without a workspace.`
            );
            vscode.debug.startDebugging(
                undefined,
                actionGroup.debugSession.newConfiguration
            );
        }
    }

    return;
}

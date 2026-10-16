import * as vscode from "vscode";

import { TaskAction } from "./configuration";
import { delay, getWorkspaceFromName } from "./utils";

function getTaskWorkspaceFolder(task: vscode.Task) {
    const scope = task.scope;
    if (typeof scope === "object" && scope !== null && "uri" in scope) {
        return scope as vscode.WorkspaceFolder;
    }
    return undefined;
}

export async function runTaskAction(
    taskAction: TaskAction,
    selectedWorkspace: vscode.WorkspaceFolder | null | undefined
) {
    var targetWorkspace = selectedWorkspace;
    if (taskAction.workspaceName) {
        const fetchedWorkspaceFromName = getWorkspaceFromName(
            taskAction.workspaceName
        );
        if (!fetchedWorkspaceFromName) {
            return;
        }
        targetWorkspace = fetchedWorkspaceFromName;
    }

    await delay(taskAction.delayTask);

    const allTasks = await vscode.tasks.fetchTasks();
    const matchingTasks = allTasks.filter(
        (task) =>
            task.name === taskAction.name &&
            (!taskAction.source || task.source === taskAction.source)
    );

    // Prefer tasks of the targeted workspace folder. Without an explicit workspace name
    // fall back to any matching task (e.g. tasks of a .code-workspace file or other folders).
    const workspaceTasks = matchingTasks.filter(
        (task) =>
            targetWorkspace &&
            getTaskWorkspaceFolder(task)?.uri.toString() ===
                targetWorkspace.uri.toString()
    );
    var task: vscode.Task | undefined = workspaceTasks[0];
    if (!task && !taskAction.workspaceName) {
        task = matchingTasks[0];
    }

    if (!task) {
        const sourceInfo = taskAction.source
            ? ` with source "${taskAction.source}"`
            : "";
        const workspaceInfo = taskAction.workspaceName
            ? ` in workspace "${taskAction.workspaceName}"`
            : "";
        console.log(
            `No task "${taskAction.name}"${sourceInfo}${workspaceInfo} found.`
        );
        vscode.window.showErrorMessage(
            `No task "${taskAction.name}"${sourceInfo}${workspaceInfo} found.`
        );
        return;
    }

    console.log(
        `Executing task "${task.name}" from source "${task.source}".`
    );
    try {
        await vscode.tasks.executeTask(task);
    } catch (error) {
        console.log(`Executing task "${task.name}" failed: ${error}`);
        vscode.window.showErrorMessage(
            `Executing task "${task.name}" failed: ${error}`
        );
    }
}

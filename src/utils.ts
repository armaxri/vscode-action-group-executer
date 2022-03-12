import * as vscode from 'vscode';

export function isNotEmptyString(value: any) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getCurrentWorkspace() {
    if (vscode.workspace.workspaceFolders?.length === 1) {
        console.log(`Only one workspace (${vscode.workspace.workspaceFolders[0].uri.fsPath}) present. Using it directly.`);
        return vscode.workspace.workspaceFolders[0];
    }
    console.log('Multi root workspace or non in selection. Using the current file to determine the workspace.');
    const currentFileUri = vscode.window.activeTextEditor?.document.uri;
    console.log(`Using file URI "${currentFileUri}" to determine workspace.`);
    const correspondingWorkspace = currentFileUri ? vscode.workspace.getWorkspaceFolder(currentFileUri) : null;
    console.log(`Using workspace "${correspondingWorkspace?.name}".`);

    return correspondingWorkspace;
}

export function getWorkspaceFromName(workspaceName: string) {
    console.log(`Request to search workspace with the name "${workspaceName}".`);
    const workspaces = vscode.workspace.workspaceFolders;
    if (!workspaces) {
        console.log(`Running in a no workspace mode, so a workspace "${workspaceName}" cannot be found.`);
        vscode.window.showErrorMessage(`Running in a no workspace mode, so a workspace "${workspaceName}" cannot be found.`);
        return null;
    }
    for(let workspace of workspaces) {
        if (workspace.name === workspaceName) {
            console.log(`Found a workspace with the name "${workspaceName}".`);
            return workspace;
        }
    }
    console.log(`No workspace with the name "${workspaceName}" was found.`);
    vscode.window.showErrorMessage(`No workspace with the name "${workspaceName}" was found.`);
    return null;
}

export function replaceAllStrings(currentObject: any, replaceFunction: (currentString: string) => string) {
    if (currentObject instanceof Object) {
        const objectKeys = Object.keys(currentObject);
        objectKeys.forEach(elementKey => {
            const element = currentObject[elementKey];
            if (typeof element === 'string') {
                currentObject[elementKey] = replaceFunction(element);
            } else {
                replaceAllStrings(element, replaceFunction);
            }
        });
    }
}

export function userInput2String(inputString: string) {
    return inputString;
}

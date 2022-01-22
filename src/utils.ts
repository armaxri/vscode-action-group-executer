import * as vscode from 'vscode';

export function isNotEmptyString(value: any) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getCurrentWorkspace() {
    const currentFileUri = vscode.window.activeTextEditor?.document.uri;
    console.log(`Using file URI "${currentFileUri}" to determine workspace.`);
    const correspondingWorkspace = currentFileUri ? vscode.workspace.getWorkspaceFolder(currentFileUri) : null;
    console.log(`Using workspace "${correspondingWorkspace?.name}".`);

    return correspondingWorkspace;
}

import * as vscode from "vscode";

export function isNotEmptyString(value: any) {
    return typeof value === "string" && value.trim().length > 0;
}

export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getCurrentWorkspace() {
    if (vscode.workspace.workspaceFolders?.length === 1) {
        console.log(
            `Only one workspace (${vscode.workspace.workspaceFolders[0].uri.fsPath}) present. Using it directly.`
        );
        return vscode.workspace.workspaceFolders[0];
    }
    console.log(
        "Multi root workspace or non in selection. Using the current file to determine the workspace."
    );
    const currentFileUri = vscode.window.activeTextEditor?.document.uri;
    console.log(`Using file URI "${currentFileUri}" to determine workspace.`);
    const correspondingWorkspace = currentFileUri
        ? vscode.workspace.getWorkspaceFolder(currentFileUri)
        : null;
    console.log(`Using workspace "${correspondingWorkspace?.name}".`);

    return correspondingWorkspace;
}

export function getWorkspaceFromName(workspaceName: string) {
    console.log(
        `Request to search workspace with the name "${workspaceName}".`
    );
    const workspaces = vscode.workspace.workspaceFolders;

    if (!workspaces) {
        console.log(
            `Running in a no workspace mode, so a workspace "${workspaceName}" cannot be found.`
        );
        vscode.window.showErrorMessage(
            `Running in a no workspace mode, so a workspace "${workspaceName}" cannot be found.`
        );
        return null;
    }

    for (let workspace of workspaces) {
        if (workspace.name === workspaceName) {
            console.log(`Found a workspace with the name "${workspaceName}".`);
            return workspace;
        }
    }

    console.log(`No workspace with the name "${workspaceName}" was found.`);
    vscode.window.showErrorMessage(
        `No workspace with the name "${workspaceName}" was found.`
    );
    return null;
}

export function replaceAllStrings(
    currentObject: any,
    replaceFunction: (currentString: string) => string
) {
    if (currentObject instanceof Object) {
        const objectKeys = Object.keys(currentObject);
        objectKeys.forEach((elementKey) => {
            const element = currentObject[elementKey];
            if (typeof element === "string") {
                currentObject[elementKey] = replaceFunction(element);
            } else {
                replaceAllStrings(element, replaceFunction);
            }
        });
    }
}

function getEscapedChar(
    currentChar: string,
    currentStrType: string = ""
): string {
    switch (currentChar) {
        case "\\":
            return currentChar;
        case "0":
            return "\0";
        case "a":
            return "a";
        case "b":
            return "\b";
        case "t":
            return "\t";
        case "n":
            return "\n";
        case "v":
            return "\v";
        case "f":
            return "\f";
        case "r":
            return "\r";
        case "'":
        case '"':
            if (currentChar === currentStrType) {
                return currentStrType;
            } else {
                return "\\" + currentChar;
            }

        default:
            // This might be shady but if there is no correct replacement, we use both characters.
            return "\\" + currentChar;
    }
}

export function userInput2String(inputString: string): string {
    var resultString = "";
    var index = 0;

    while (index < inputString.length) {
        const currentChar = inputString.charAt(index);

        if (currentChar === "\\") {
            if (index + 1 < inputString.length) {
                const nextChar = inputString.charAt(index + 1);

                resultString = resultString + getEscapedChar(nextChar);

                // Extra plus one because we consumed another character.
                index = index + 1;
            } else {
                resultString = resultString + currentChar;
            }
        } else {
            resultString = resultString + currentChar;
        }

        index = index + 1;
    }

    return resultString;
}

export function splitArguments(inputString: string): Array<string> {
    const args = new Array<string>();
    var currentArg = "";
    // Store if a string was started and if yes with the kind of character.
    var stringStart = "";
    var index = 0;

    while (index < inputString.length) {
        const currentChar = inputString.charAt(index);

        if (currentChar === "\\") {
            if (index + 1 < inputString.length) {
                const nextChar = inputString.charAt(index + 1);
                const escapedChar = getEscapedChar(nextChar, stringStart);
                currentArg = currentArg + escapedChar;

                // Extra plus one because we consumed another character.
                index = index + 1;
            } else {
                // Workaround since we don't have error highlighting.
                currentArg = currentArg + currentChar;
            }
        } else if (currentChar === "'" || currentChar === '"') {
            if (stringStart === currentChar) {
                // If we are in a string and the type is matching, we end here.
                // Keep in mind that escaped characters are already dealt with.
                stringStart = "";
            } else if (stringStart !== "") {
                // If we are in a string and there was no match, it's a different string character. So we simply use it.
                currentArg = currentArg + currentChar;
            } else {
                // This case deals with string starts. The character is not added but we memories the start of the string.
                stringStart = currentChar;
            }
        } else if (currentChar === " ") {
            if (stringStart !== "") {
                currentArg = currentArg + currentChar;
            } else {
                args.push(currentArg);
                currentArg = "";
            }
        } else {
            currentArg = currentArg + currentChar;
        }

        index = index + 1;
    }

    if (currentArg !== "") {
        args.push(currentArg);
    }

    return args;
}

export class ArgumentsInputBoxOptions implements vscode.InputBoxOptions {
    title: string = "Add additional arguments here.";
    value: string = "";

    // Add valid input check here.
}

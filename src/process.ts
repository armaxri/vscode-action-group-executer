import * as vscode from 'vscode';
import * as child_process from 'child_process';

import { ActionGroup, ProcessAction, ProcessCommand } from "./configuration";
import * as utils from "./utils";

function getMatchingEditor(document: vscode.TextDocument) {
    const editors = vscode.window.visibleTextEditors;
    for (let i = 0; i < editors.length; i++) {
        if (editors[i].document === document) {
            return editors[i];
        }
    }
    return null;
}

class DocumentHandler {
    document: vscode.TextDocument;
    processesStillRunning: boolean = true;
    data: Array<string> = new Array<string>();

    constructor(document: vscode.TextDocument) {
        this.document = document;
    }

    public async updateDocumentInBackground() {
        console.log('Start document handling in background.');
        while (!this.document.isClosed) {
            if (this.data.length > 0) {
                const editor = getMatchingEditor(this.document);
                if (editor) {
                    editor.edit((textEditorEdit) => {
                        do {
                            var data = this.data.shift();
                            if (data) {
                                textEditorEdit.insert(new vscode.Position(this.document.lineCount + 1, 0), data);
                            }
                        } while (data);
                    });
                }
            } else if (!this.processesStillRunning) {
                // If no process is running and there are no new data, simply quit.
                console.log('Ending document handle caused by ended process.');
                return;
            }
            await utils.delay(100);
        }
        console.log('Ending document handle caused by closed document.');
    }

    public addNewData(newData: string) {
        this.data.push(newData);
    }
}

async function runCall(documentHandle: DocumentHandler, commands: ProcessCommand[], currentIndex: number) {
    const currentCommand = commands[currentIndex];
    if (currentCommand.call.length === 0) {
        console.log('No call was set in the command. Exiting.');
        return;
    }

    const spawnCommand = currentCommand.call[0];
    const spawnArguments = currentCommand.call.slice(1);
    const printableArguments = spawnArguments.join('", "');
    console.log(`Spawning process with command "${spawnCommand}" using arguments "${printableArguments}".`);
    const subprocess = child_process.spawn(spawnCommand, spawnArguments);

    subprocess.stdout.on('data', (data) => {
        const dataAsString = `${data}`;
        console.log(`stdout: ${dataAsString.replace('\n', '')}`);

        // If the document is already closed, we should also stop the process execution.
        if (documentHandle.document.isClosed) {
            console.log(`Document for process "${spawnCommand}" using arguments "${printableArguments}" was closed. Killing process.`);
            subprocess.kill();
        } else {
            documentHandle.addNewData(dataAsString);
        }
    });

    subprocess.on('exit', (code) => {
        console.log(`Child process exited with code ${code}.`);
    });

    subprocess.on('close', (code) => {
        console.log(`Child process close all stdio with code ${code}.`);

        // Only of the document is still open, we should continue ;)
        if (!documentHandle.document.isClosed) {
            const nextIndex = currentIndex + 1;
            if (nextIndex < commands.length) {
                runCall(documentHandle, commands, nextIndex);
            } else {
                console.log('No further commands to handle for the document.');
                documentHandle.processesStillRunning = false;
            }
        } else {
            console.log(`Document for process "${spawnCommand}" using arguments "${printableArguments}" was closed. Starting no further processes process.`);
            documentHandle.processesStillRunning = false;
        }
    });
}

async function runProcess(process: ProcessAction, spawnNumber: number) {
    // This value was determined empirically. If there are complains, it should be increased or made selectable.
    await utils.delay(500 * spawnNumber);

    console.log('Preparing document for process.');
    const document = await vscode.workspace.openTextDocument({language: 'plaintext'});
    await vscode.window.showTextDocument(document);
    var documentHandle = new DocumentHandler(document);
    documentHandle.updateDocumentInBackground();

    if (process.command) {
        process.commands = [process.command];
    }

    if (process.commands) {
        runCall(documentHandle, process.commands, 0);
    } else {
        console.log('There was no commands set in the ProcessAction.');
    }
}

export async function runProcesses(actionGroup: ActionGroup) {
    if (!actionGroup.processes) {
        console.log('No valid processes in group. Exit function.');
        return;
    }

    var spawnNumber = 0;
    actionGroup.processes.forEach(process => {
        runProcess(process, spawnNumber);
        spawnNumber = spawnNumber + 1;
    });
}

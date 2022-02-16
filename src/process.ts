import * as vscode from 'vscode';
import * as child_process from 'child_process';

import { ActionGroup, ProcessAction, ProcessCommand } from "./configuration";
import * as utils from "./utils";

const FILE_INITIAL_STRING = ' ';

abstract class DocumentHandleRegistry {
    public static activeHandles: Array<DocumentHandler> = new Array<DocumentHandler>();

    /**
     * static getHandleBehindTextDocument
     */
    public static getHandleBehindTextDocument(document: vscode.TextDocument) : DocumentHandler | null {
        for(let handle of this.activeHandles) {
            if (document === handle.document) {
                return handle;
            }
        }

        return null;
    }
}

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
    processAction: ProcessAction;
    processesStillRunning: boolean = true;
    freshInitialized: boolean = true;
    data: Array<string> = new Array<string>();
    currentSubProcess: child_process.ChildProcessWithoutNullStreams | null = null;

    constructor(document: vscode.TextDocument, processAction: ProcessAction) {
        this.document = document;
        this.processAction = processAction;
    }

    private writeDataToDocument(editor: vscode.TextEditor) {
        editor.edit((textEditorEdit) => {
            do {
                var data = this.data.shift();
                if (data) {
                    if (this.freshInitialized) {
                        // If not initialized and still with the same text, replace it with the new text.
                        // Otherwise if input was entered just extend the content.
                        if (this.document.getText() === FILE_INITIAL_STRING) {
                            textEditorEdit.replace(this.document.lineAt(this.document.lineCount - 1).range, data);
                        } else {
                            textEditorEdit.insert(new vscode.Position(this.document.lineCount + 1, 0), data);
                        }
                        this.freshInitialized = false;
                    } else {
                        textEditorEdit.insert(new vscode.Position(this.document.lineCount + 1, 0), data);
                    }
                }
            } while (data);
        });
    }

    private updateDocumentViewRange(editor: vscode.TextEditor) {
        const currentSelection = editor.selection;
        const fileEndPosition = new vscode.Position(editor.document.lineCount - 1, 0);
        if (currentSelection.active.isEqual(fileEndPosition)) {
            editor.revealRange(new vscode.Range(fileEndPosition, fileEndPosition));
        }
    }

    public async updateDocumentInBackground() {
        console.log('Start document handling in background.');
        while (!this.document.isClosed) {
            if (this.data.length > 0) {
                const editor = getMatchingEditor(this.document);
                if (editor) {
                    // Start with adding t he new data to the file.
                    this.writeDataToDocument(editor);

                    // Continue with updating view range. This is only done when new data arrived before.
                    // Otherwise this might lead to strange behavior.
                    this.updateDocumentViewRange(editor);
                }
            } else if (!this.processesStillRunning) {
                // If no process is running and there are no new data, simply quit.
                console.log('Ending document handle caused by ended process.');
                DocumentHandleRegistry.activeHandles.splice(DocumentHandleRegistry.activeHandles.indexOf(this));
                return;
            }
            await utils.delay(100);
        }
        console.log('Ending document handle caused by closed document.');
        DocumentHandleRegistry.activeHandles.splice(DocumentHandleRegistry.activeHandles.indexOf(this));
    }

    public addNewData(newData: string) {
        this.data.push(newData);
    }
}

export async function killCurrentProcess() {
    console.log('Triggered killing current process behind current file tab.');
    const selectedTextEditor = vscode.window.activeTextEditor;

    if (selectedTextEditor) {
        const handleToFile = DocumentHandleRegistry.getHandleBehindTextDocument(selectedTextEditor.document);
        if (handleToFile) {
            console.log('Found process behind current file tab.');
            handleToFile.processesStillRunning = false;
            handleToFile.currentSubProcess?.kill();
        } else {
            console.log('No process found behind current file tab.');
        }
    } else {
        console.log('No file was selected.');
    }
}

async function runCall(documentHandle: DocumentHandler) {
    const currentCommand = documentHandle.processAction.getCurrentCommand();

    await utils.delay(currentCommand.delayProcess);

    const printableArguments = currentCommand.args.join('", "');
    console.log(`Spawning process with command "${currentCommand.program}" using arguments "${printableArguments}".`);
    if (documentHandle.processAction.printCommand) {
        documentHandle.addNewData(`program: "${currentCommand.program}", args: "${printableArguments}"\n`);
    }

    const subprocess = child_process.spawn(currentCommand.program, currentCommand.args, currentCommand.extendedOptions);
    documentHandle.currentSubProcess = subprocess;

    function handleData(data: any, source: string) {
        // When running on Windows "\r\n" is used by some programs and will cause two
        // new lines to be displayed. Prevent it by removing the '\r' and simply use
        // '\n' as only line ending.
        const dataAsString = `${data}`.replace('\r', '');
        console.log(`${source}: ${dataAsString.replace('\n', '')}`);

        // If the document is already closed, we should also stop the process execution.
        if (documentHandle.document.isClosed) {
            console.log(`Document for process "${currentCommand.program}" using arguments "${printableArguments}" was closed. Killing process.`);
            subprocess.kill();
        } else {
            documentHandle.addNewData(dataAsString);
        }
    }

    subprocess.stdout.on('data', (data) => {
        handleData(data, 'stdout');
    });

    subprocess.stderr.on('data', (data) => {
        handleData(data, 'stderr');
    });

    subprocess.on('exit', (code) => {
        console.log(`Child process exited with code ${code}.`);
        if (!currentCommand.hideProcessEndMessage) {
            const message = currentCommand.processEndMessage?.replace('${returnCode}', `${code}`);
            handleData(message, 'exit');
        }
    });

    subprocess.on('close', (code) => {
        console.log(`Child process close all stdio with code ${code}.`);
        documentHandle.currentSubProcess = null;

        // Only of the document is still open, we should continue ;)
        if (!documentHandle.document.isClosed) {
            if (documentHandle.processAction.hasNextCommand()) {
                documentHandle.processAction.selectNextCommand();
                if (documentHandle.processesStillRunning) {
                    runCall(documentHandle);
                } else {
                    console.log(`Wanted to execute process "${currentCommand.program}" using arguments "${printableArguments}" but the process was terminated before.`);
                }
            } else {
                console.log('No further commands to handle for the document.');
                documentHandle.processesStillRunning = false;
            }
        } else {
            console.log(`Document for process "${currentCommand.program}" using arguments "${printableArguments}" was closed. Starting no further processes process.`);
            documentHandle.processesStillRunning = false;
        }
    });
}

async function runProcess(process: ProcessAction, spawnNumber: number) {
    // This value was determined empirically. If there are complains, it should be increased or made selectable.
    await utils.delay(500 * spawnNumber);

    console.log('Preparing document for process.');
    // Use an initial string to force the creation of the document.
    // Remove it on the first write action.
    const initialContent = process.printName ? process.name + '\n' : FILE_INITIAL_STRING;
    const document = await vscode.workspace.openTextDocument({language: 'plaintext', content: initialContent});
    await vscode.window.showTextDocument(document);
    var documentHandle = new DocumentHandler(document, process);
    DocumentHandleRegistry.activeHandles.push(documentHandle);
    documentHandle.updateDocumentInBackground();

    if (process.commands) {
        runCall(documentHandle);
    } else {
        console.log('There was no commands set in the ProcessAction.');
    }
}

export async function runProcesses(actionGroup: ActionGroup) {
    var spawnNumber = 0;
    actionGroup.processes.forEach(process => {
        runProcess(process, spawnNumber);
        spawnNumber = spawnNumber + 1;
    });
}


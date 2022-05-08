import * as vscode from "vscode";
import * as child_process from "child_process";

import { ActionGroup, ProcessAction, ProcessCommand } from "./configuration";
import * as utils from "./utils";

const FILE_INITIAL_STRING = " ";

abstract class DocumentHandleRegistry {
    public static activeHandles: Array<DocumentHandler> =
        new Array<DocumentHandler>();

    public static getHandleBehindTextDocument(
        document: vscode.TextDocument
    ): DocumentHandler | null {
        for (let handle of this.activeHandles) {
            if (document === handle.document) {
                return handle;
            }
        }

        return null;
    }
}

function getMatchingEditor(document: vscode.TextDocument) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document === document) {
        return activeEditor;
    }
    const editors = vscode.window.visibleTextEditors;
    for (let i = 0; i < editors.length; i++) {
        if (editors[i].document === document) {
            return editors[i];
        }
    }
    return null;
}

class DocumentHandler implements vscode.QuickPickItem {
    document: vscode.TextDocument;
    processAction: ProcessAction;
    processesStillRunning: boolean = true;
    freshInitialized: boolean = true;
    data: Array<string> = new Array<string>();
    currentSubProcess: child_process.ChildProcessWithoutNullStreams | null =
        null;
    currentCommandNum: number = 0;

    // QuickPickItem implementation for selection in quick picks.
    label: string;
    description?: string | undefined;
    detail?: string | undefined;
    picked?: boolean | undefined;
    alwaysShow?: boolean | undefined;
    buttons?: readonly vscode.QuickInputButton[] | undefined;

    constructor(document: vscode.TextDocument, processAction: ProcessAction) {
        this.document = document;
        this.processAction = processAction;

        this.label = this.processAction.name;
        this.description = this.getCurrentCommandAsString();
    }

    public getCurrentCommand(): ProcessCommand {
        return this.processAction.commands[this.currentCommandNum];
    }

    public selectNextCommand() {
        this.currentCommandNum = this.currentCommandNum + 1;
        this.description = this.getCurrentCommandAsString();
    }

    public hasNextCommand(): boolean {
        return this.processAction.commands.length > this.currentCommandNum + 1;
    }

    public getCurrentCommandAsString(): string {
        const currentCommand = this.getCurrentCommand();
        const printableArguments = currentCommand.args.join('", "');
        return `program: "${currentCommand.program}", args: "${printableArguments}"`;
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
                            textEditorEdit.replace(
                                this.document.lineAt(
                                    this.document.lineCount - 1
                                ).range,
                                data
                            );
                        } else {
                            textEditorEdit.insert(
                                new vscode.Position(
                                    this.document.lineCount + 1,
                                    0
                                ),
                                data
                            );
                        }
                        this.freshInitialized = false;
                    } else {
                        textEditorEdit.insert(
                            new vscode.Position(this.document.lineCount + 1, 0),
                            data
                        );
                    }
                }
            } while (data);
        });
    }

    private updateDocumentViewRange() {
        vscode.window.visibleTextEditors.forEach((currentEditor) => {
            const currentSelection = currentEditor.selection;
            const fileEndPosition = new vscode.Position(
                currentEditor.document.lineCount - 1,
                0
            );
            if (currentSelection.active.isEqual(fileEndPosition)) {
                currentEditor.revealRange(
                    new vscode.Range(fileEndPosition, fileEndPosition)
                );
            }
        });
    }

    public async updateDocumentInBackground() {
        console.log("Start document handling in background.");
        while (!this.document.isClosed) {
            if (this.data.length > 0) {
                const editor = getMatchingEditor(this.document);
                if (editor) {
                    // Start with adding t he new data to the file.
                    this.writeDataToDocument(editor);

                    // Continue with updating view range. This is only done when new data arrived before.
                    // Otherwise this might lead to strange behavior.
                    this.updateDocumentViewRange();
                }
            } else if (!this.processesStillRunning) {
                // If no process is running and there are no new data, simply quit.
                console.log("Ending document handle caused by ended process.");
                DocumentHandleRegistry.activeHandles =
                    DocumentHandleRegistry.activeHandles.filter(
                        (obj) => obj !== this
                    );
                return;
            }
            await utils.delay(100);
        }
        console.log("Ending document handle caused by closed document.");
        DocumentHandleRegistry.activeHandles =
            DocumentHandleRegistry.activeHandles.filter((obj) => obj !== this);
    }

    public addNewData(newData: string) {
        this.data.push(newData);
    }
}

abstract class ControlRunningProcessQuickPickItem
    implements vscode.QuickPickItem
{
    documentHandle: DocumentHandler;
    label: string;
    description?: string | undefined;
    detail?: string | undefined;
    picked?: boolean | undefined;
    alwaysShow?: boolean | undefined;
    buttons?: readonly vscode.QuickInputButton[] | undefined;

    constructor(label: string, documentHandle: DocumentHandler) {
        this.label = label;
        this.documentHandle = documentHandle;
    }

    abstract runAction(): any;
}

class KillProcessQuickPick extends ControlRunningProcessQuickPickItem {
    constructor(documentHandle: DocumentHandler) {
        super("Kill Process", documentHandle);
    }

    runAction() {
        this.documentHandle.processesStillRunning = false;
        this.documentHandle.currentSubProcess?.kill();
    }
}

async function sendMessage2Process(documentHandle: DocumentHandler) {
    const input = await vscode.window.showInputBox();
    if (input) {
        console.log(`Received write input "${input}".`);
        const message = utils.userInput2String(input);

        console.log(`Writing translated "${message}" to process.`);
        documentHandle.currentSubProcess?.stdin.write(message + "\n");
    }
}

class SendInput2ProcessQuickPick extends ControlRunningProcessQuickPickItem {
    constructor(documentHandle: DocumentHandler) {
        super("Send Input to Process", documentHandle);
    }

    async runAction() {
        sendMessage2Process(this.documentHandle);
    }
}

export async function controlRunningProcess() {
    const selection = await vscode.window.showQuickPick(
        DocumentHandleRegistry.activeHandles
    );

    if (!selection) {
        console.log(`No valid selection was taken for process control.`);
        return;
    }

    const controlActions = new Array<ControlRunningProcessQuickPickItem>();
    controlActions.push(new SendInput2ProcessQuickPick(selection));
    controlActions.push(new KillProcessQuickPick(selection));

    const actionSelection = await vscode.window.showQuickPick(controlActions);

    if (!actionSelection) {
        console.log(`No valid actionSelection was taken for process control.`);
        return;
    }
    actionSelection.runAction();
}

export async function sendMessage2RunningProcess() {
    console.log(
        "Triggered send message to current process behind current file tab."
    );
    const selectedTextEditor = vscode.window.activeTextEditor;

    if (selectedTextEditor) {
        const handleToFile = DocumentHandleRegistry.getHandleBehindTextDocument(
            selectedTextEditor.document
        );
        if (handleToFile) {
            console.log("Found process behind current file tab.");
            sendMessage2Process(handleToFile);
        } else {
            console.log("No process found behind current file tab.");
        }
    } else {
        console.log("No file was selected.");
    }
}

export async function killCurrentProcess() {
    console.log("Triggered killing current process behind current file tab.");
    const selectedTextEditor = vscode.window.activeTextEditor;

    if (selectedTextEditor) {
        const handleToFile = DocumentHandleRegistry.getHandleBehindTextDocument(
            selectedTextEditor.document
        );
        if (handleToFile) {
            console.log("Found process behind current file tab.");
            handleToFile.processesStillRunning = false;
            handleToFile.currentSubProcess?.kill();
        } else {
            console.log("No process found behind current file tab.");
        }
    } else {
        console.log("No file was selected.");
    }
}

export async function killAllProcesses() {
    console.log("Triggered kill all background processes.");
    DocumentHandleRegistry.activeHandles.forEach((handle) => {
        handle.processesStillRunning = false;
        handle.currentSubProcess?.kill();
    });
}

class ArgumentsInputBoxOptions implements vscode.InputBoxOptions {
    title: string = "Add additional arguments here.";
    value: string = "";

    // Add valid input check here.
}

async function runCall(documentHandle: DocumentHandler) {
    const currentCommand = documentHandle.getCurrentCommand();

    await utils.delay(currentCommand.delayProcess);

    var additionalArgs = new Array<string>();
    var additionalArgsPrintable = "";
    if (currentCommand.requestUserInputArguments) {
        const additionalArgsString = await vscode.window.showInputBox(
            new ArgumentsInputBoxOptions()
        );
        if (additionalArgsString) {
            additionalArgs = utils.splitArguments(additionalArgsString);

            const printableArguments = additionalArgs.join('", "');
            additionalArgsPrintable = `, additional user args: "${printableArguments}"`;
        }
    }

    const currentCommandString = documentHandle.getCurrentCommandAsString();
    console.log(
        `Spawning process with <${currentCommandString}${additionalArgsPrintable}>.`
    );
    if (documentHandle.processAction.printCommand) {
        documentHandle.addNewData(currentCommandString + "\n");
    }

    const usedArgs = currentCommand.args.concat(additionalArgs);
    const subprocess = child_process.spawn(
        currentCommand.program,
        usedArgs,
        currentCommand.extendedOptions
    );
    documentHandle.currentSubProcess = subprocess;

    function handleData(data: any, source: string) {
        // When running on Windows "\r\n" is used by some programs and will cause two
        // new lines to be displayed. Prevent it by removing the '\r' and simply use
        // '\n' as only line ending.
        const dataAsString = `${data}`.replace("\r", "");
        console.log(`${source}: ${dataAsString.replace("\n", "")}`);

        // If the document is already closed, we should also stop the process execution.
        if (documentHandle.document.isClosed) {
            console.log(
                `Document for process <${currentCommandString}> was closed. Killing process.`
            );
            subprocess.kill();
        } else {
            documentHandle.addNewData(dataAsString);
        }
    }

    subprocess.stdout.on("data", (data) => {
        handleData(data, "stdout");
    });

    subprocess.stderr.on("data", (data) => {
        handleData(data, "stderr");
    });

    subprocess.on("error", (err) => {
        handleData(`Child process created an error: ${err}`, "process_error");
        vscode.window.showErrorMessage(`Process triggered error: ${err}`);
    });

    subprocess.on("exit", (code) => {
        console.log(`Child process exited with code ${code}.`);
        if (!currentCommand.hideProcessEndMessage) {
            const message = currentCommand.processEndMessage?.replace(
                "${returnCode}",
                `${code}`
            );
            handleData(message, "exit");
        }
    });

    subprocess.on("close", (code) => {
        console.log(`Child process close all stdio with code ${code}.`);
        documentHandle.currentSubProcess = null;

        // Only of the document is still open, we should continue ;)
        if (!documentHandle.document.isClosed) {
            if (documentHandle.hasNextCommand()) {
                documentHandle.selectNextCommand();
                if (documentHandle.processesStillRunning) {
                    runCall(documentHandle);
                } else {
                    console.log(
                        `Wanted to execute process <${currentCommandString}> but the process was terminated before.`
                    );
                }
            } else {
                console.log("No further commands to handle for the document.");
                documentHandle.processesStillRunning = false;
            }
        } else {
            console.log(
                `Document for process <${currentCommandString}> was closed. Starting no further processes process.`
            );
            documentHandle.processesStillRunning = false;
        }
    });
}

async function runProcess(process: ProcessAction, spawnNumber: number) {
    // This value was determined empirically. If there are complains, it should be increased or made selectable.
    await utils.delay(500 * spawnNumber);

    console.log("Preparing document for process.");
    // Use an initial string to force the creation of the document.
    // Remove it on the first write action.
    const initialContent = process.printName
        ? process.name + "\n"
        : FILE_INITIAL_STRING;
    const document = await vscode.workspace.openTextDocument({
        language: process.fileAssociationType,
        content: initialContent,
    });
    await vscode.window.showTextDocument(document);
    var documentHandle = new DocumentHandler(document, process);
    DocumentHandleRegistry.activeHandles.push(documentHandle);
    documentHandle.updateDocumentInBackground();

    if (process.commands) {
        runCall(documentHandle);
    } else {
        console.log("There was no commands set in the ProcessAction.");
    }
}

export async function runProcesses(actionGroup: ActionGroup) {
    var spawnNumber = 0;
    actionGroup.processes.forEach((process) => {
        runProcess(process, spawnNumber);
        spawnNumber = spawnNumber + 1;
    });
}

import * as vscode from "vscode";

// Replaces vscode.window.showErrorMessage while the callback runs and returns all messages.
export async function captureErrorMessages(
    callback: () => Promise<unknown>
): Promise<Array<string>> {
    const messages = new Array<string>();
    const window = vscode.window as any;
    const original = window.showErrorMessage;
    window.showErrorMessage = (message: string) => {
        messages.push(message);
        return Promise.resolve(undefined);
    };
    try {
        await callback();
    } finally {
        window.showErrorMessage = original;
    }
    return messages;
}

export interface TaskRun {
    name: string;
    startTime: number;
    exitCode: number | undefined;
}

// Collects all task runs that start and end until dispose is called.
export class TaskRunRecorder implements vscode.Disposable {
    runs = new Array<TaskRun>();
    private startTimes = new Map<vscode.TaskExecution, number>();
    private listeners: Array<vscode.Disposable>;
    private waiting = new Array<() => void>();

    constructor() {
        this.listeners = [
            vscode.tasks.onDidStartTask((event) => {
                this.startTimes.set(event.execution, Date.now());
            }),
            vscode.tasks.onDidEndTaskProcess((event) => {
                this.runs.push({
                    name: event.execution.task.name,
                    startTime: this.startTimes.get(event.execution) ?? 0,
                    exitCode: event.exitCode,
                });
                this.waiting.forEach((resolve) => resolve());
            }),
        ];
    }

    public async waitForRun(name: string, timeoutMs = 20000): Promise<TaskRun> {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            const run = this.runs.find((run) => run.name === name);
            if (run) {
                return run;
            }
            await new Promise<void>((resolve) => {
                this.waiting.push(resolve);
                setTimeout(resolve, 200);
            });
        }
        throw new Error(`Task "${name}" did not finish within ${timeoutMs} ms.`);
    }

    dispose() {
        this.listeners.forEach((listener) => listener.dispose());
    }
}

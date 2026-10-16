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

// One expected interaction of the setup wizard and the answer to give.
export type WizardStep = { before?: () => Promise<void> } & (
    | { pick: string }
    | { pickMany: Array<string> }
    | { input: string; invalid?: boolean }
    | { confirm: boolean }
    | { cancel: true }
);

// Answers the wizard interactions from a script and fails on unexpected ones.
export class ScriptedWizardUI {
    infos = new Array<string>();
    warnings = new Array<string>();
    pickedFrom = new Array<Array<vscode.QuickPickItem>>();
    private steps: Array<WizardStep>;

    constructor(steps: Array<WizardStep>) {
        this.steps = [...steps];
    }

    private async next(kind: string, context: string): Promise<WizardStep> {
        const step = this.steps.shift();
        if (!step) {
            throw new Error(`Unexpected ${kind} "${context}" after the script ended.`);
        }
        if (step.before) {
            await step.before();
        }
        return step;
    }

    private findItem<T extends vscode.QuickPickItem>(items: Array<T>, label: string) {
        const selectable = items.filter(
            (item) => item.kind !== vscode.QuickPickItemKind.Separator
        );
        const item =
            selectable.find((item) => item.label === label) ??
            selectable.find((item) => item.label.includes(label));
        if (!item) {
            const labels = selectable.slice(0, 30).map((item) => item.label);
            throw new Error(`No item "${label}" in: ${labels.join(" | ")}`);
        }
        return item;
    }

    public async pick<T extends vscode.QuickPickItem>(
        items: Array<T>,
        options: vscode.QuickPickOptions
    ) {
        const step = await this.next("pick", options.title ?? "");
        this.pickedFrom.push(items);
        if ("cancel" in step) {
            return undefined;
        }
        if (!("pick" in step)) {
            throw new Error(`Expected ${JSON.stringify(step)} but got pick "${options.title}".`);
        }
        return this.findItem(items, step.pick);
    }

    public async pickMany<T extends vscode.QuickPickItem>(
        items: Array<T>,
        options: vscode.QuickPickOptions
    ) {
        const step = await this.next("pickMany", options.title ?? "");
        if ("cancel" in step) {
            return undefined;
        }
        if (!("pickMany" in step)) {
            throw new Error(`Expected ${JSON.stringify(step)} but got pickMany "${options.title}".`);
        }
        return step.pickMany.map((label) => this.findItem(items, label));
    }

    public async input(options: vscode.InputBoxOptions) {
        var step = await this.next("input", options.prompt ?? "");
        while (true) {
            if ("cancel" in step) {
                return undefined;
            }
            if (!("input" in step)) {
                throw new Error(`Expected ${JSON.stringify(step)} but got input "${options.prompt}".`);
            }
            const validation = await options.validateInput?.(step.input);
            if (step.invalid) {
                if (!validation) {
                    throw new Error(`Input "${step.input}" was expected to be invalid.`);
                }
                // The input box stays open, so the next step answers it again.
                step = await this.next("input", options.prompt ?? "");
                continue;
            }
            if (validation) {
                throw new Error(`Input "${step.input}" is invalid: ${validation}`);
            }
            return step.input;
        }
    }

    public async confirm(message: string) {
        const step = await this.next("confirm", message);
        if (!("confirm" in step)) {
            throw new Error(`Expected ${JSON.stringify(step)} but got confirm "${message}".`);
        }
        return step.confirm;
    }

    public showInfo(message: string) {
        this.infos.push(message);
    }

    public showWarning(message: string) {
        this.warnings.push(message);
    }

    public assertFinished() {
        if (this.steps.length > 0) {
            throw new Error(`Unused wizard steps: ${JSON.stringify(this.steps)}`);
        }
    }
}

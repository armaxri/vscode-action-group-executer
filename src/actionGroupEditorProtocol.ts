// Messages and data exchanged between the action group editor and its webview.
import type { EIActionGroup } from "./configuration";

export interface EditorTarget {
    id: string;
    label: string;
}

export interface EditorGroup {
    // Target id and index in the stored list, e.g. "2:#0".
    id: string;
    targetId: string;
    config: EIActionGroup;
    folderPath: string;
    // Command line of each process, null for processes with sequential commands.
    processLines: Array<string | null>;
}

export interface TaskChoice {
    name: string;
    source: string;
    folder?: string;
}

export interface CommandChoice {
    id: string;
    title?: string;
}

export interface LaunchChoice {
    name: string;
    folder?: string;
    location: string;
    detail: string;
}

export interface EditorChoices {
    tasks: Array<TaskChoice>;
    commands: Array<CommandChoice>;
    launches: Array<LaunchChoice>;
    folderPaths: Array<string>;
    multiRoot: boolean;
}

export interface EditorState {
    targets: Array<EditorTarget>;
    groups: Array<EditorGroup>;
    choices: EditorChoices;
}

export interface SaveRequest {
    // Set when an existing group is saved.
    id?: string;
    original?: EIActionGroup;
    targetId: string;
    config: EIActionGroup;
    folderPath: string;
    processLines: Array<string | null>;
}

export interface DeleteRequest {
    id: string;
    original: EIActionGroup;
}

export interface EditorResult {
    ok: boolean;
    error?: string;
    // Id of the saved group, so the webview can select it.
    select?: string;
}

export type WebviewMessage =
    | { type: "ready" }
    | { type: "save"; requestId: number; request: SaveRequest }
    | { type: "delete"; requestId: number; request: DeleteRequest }
    | { type: "openSettings"; targetId: string };

export type ExtensionMessage =
    | { type: "state"; state: EditorState }
    | { type: "newGroup" }
    | {
          type: "result";
          requestId: number;
          result: EditorResult;
          state: EditorState;
      };

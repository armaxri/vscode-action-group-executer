import * as vscode from "vscode";

import { EIActionGroup, GroupSource } from "./configuration";

const settingsSection = "actionGroupExecuter";
const actionGroupsKey = "actionGroups";

// A settings level the raw action group configuration can be read from and written to.
export class SettingsTarget {
    label: string;
    configurationTarget: vscode.ConfigurationTarget;
    folder?: vscode.WorkspaceFolder;

    constructor(
        configurationTarget: vscode.ConfigurationTarget,
        folder?: vscode.WorkspaceFolder
    ) {
        this.configurationTarget = configurationTarget;
        this.folder = folder;
        switch (configurationTarget) {
            case vscode.ConfigurationTarget.Global:
                this.label = GroupSource.user;
                break;
            case vscode.ConfigurationTarget.Workspace:
                this.label = GroupSource.workspace;
                break;
            default:
                this.label = `${GroupSource.workspaceFolder} (${folder?.name})`;
        }
    }

    private getConfiguration() {
        return vscode.workspace.getConfiguration(
            settingsSection,
            this.folder?.uri
        );
    }

    public readGroups(): Array<EIActionGroup> {
        const inspect = this.getConfiguration().inspect(actionGroupsKey);
        var value: unknown;
        switch (this.configurationTarget) {
            case vscode.ConfigurationTarget.Global:
                value = inspect?.globalValue;
                break;
            case vscode.ConfigurationTarget.Workspace:
                value = inspect?.workspaceValue;
                break;
            default:
                value = inspect?.workspaceFolderValue;
        }
        // Clone, so changes don't leak into the cached configuration.
        return Array.isArray(value) ? cloneJson(value) : [];
    }

    public async writeGroups(groups: Array<EIActionGroup>) {
        await this.getConfiguration().update(
            actionGroupsKey,
            groups.length > 0 ? groups : undefined,
            this.configurationTarget
        );
    }
}

export class StoredActionGroup {
    target: SettingsTarget;
    index: number;
    config: EIActionGroup;

    constructor(target: SettingsTarget, index: number, config: EIActionGroup) {
        this.target = target;
        this.index = index;
        this.config = config;
    }
}

export function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// Lists the settings levels in the same way as they are merged when reading the action groups.
export function getSettingsTargets(): Array<SettingsTarget> {
    const targets = new Array<SettingsTarget>();
    const folders = vscode.workspace.workspaceFolders ?? [];

    if (folders.length > 0) {
        targets.push(new SettingsTarget(vscode.ConfigurationTarget.Workspace));
    }
    // Without a workspace file the folder settings equal the workspace settings.
    if (vscode.workspace.workspaceFile) {
        folders.forEach((folder) => {
            targets.push(
                new SettingsTarget(
                    vscode.ConfigurationTarget.WorkspaceFolder,
                    folder
                )
            );
        });
    }
    targets.push(new SettingsTarget(vscode.ConfigurationTarget.Global));

    return targets;
}

export function getStoredActionGroups(): Array<StoredActionGroup> {
    const storedGroups = new Array<StoredActionGroup>();
    getSettingsTargets().forEach((target) => {
        target.readGroups().forEach((group, index) => {
            storedGroups.push(new StoredActionGroup(target, index, group));
        });
    });
    return storedGroups;
}

export async function addActionGroup(
    target: SettingsTarget,
    group: EIActionGroup
) {
    const groups = target.readGroups();
    groups.push(group);
    await target.writeGroups(groups);
}

// Re-reads the settings and makes sure the stored group was not changed in the meantime.
function getVerifiedGroups(storedGroup: StoredActionGroup) {
    const groups = storedGroup.target.readGroups();
    if (
        JSON.stringify(groups[storedGroup.index]) !==
        JSON.stringify(storedGroup.config)
    ) {
        throw new Error(
            `The action group "${storedGroup.config.name}" was changed in the ${storedGroup.target.label} in the meantime.`
        );
    }
    return groups;
}

export async function replaceActionGroup(
    storedGroup: StoredActionGroup,
    group: EIActionGroup
) {
    const groups = getVerifiedGroups(storedGroup);
    groups[storedGroup.index] = group;
    await storedGroup.target.writeGroups(groups);
}

export async function deleteActionGroup(storedGroup: StoredActionGroup) {
    const groups = getVerifiedGroups(storedGroup);
    groups.splice(storedGroup.index, 1);
    await storedGroup.target.writeGroups(groups);
}

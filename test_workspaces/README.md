# Test Workspaces

To test the plugin in different environments, this directory contains workspace setups for testing and reproduction. The workspaces use Python examples to keep things simple.

Open each workspace in VS Code using the method described below, then use
`ActionGroupExec: Execute Action Group` (`Ctrl+Shift+A` / `Cmd+Shift+A`) to run the
configured examples.

## workspace00

Single-directory workspace. Open the `workspace00/` folder directly in VS Code.

Tests the full range of basic terminal and process options:
`alwaysNewTerminal`, `disposeOldTerminal`, `showTerminal`, `delayCommand`,
`extendedOptions`, env variable substitution (`${env:HOME}`), process output to file
tabs (single command and sequential `commands` array), and debug sessions via both
`namedConfiguration` and `newConfiguration`.

## workspace01

Multi-root workspace. Open `workspace01/dir00/example01.code-workspace` in VS Code.

Action groups and the launch configuration are defined **only** in the `.code-workspace`
file. The two workspace folders (`dir00`, `dir01`) have no `.vscode/` directories.
Tests that the extension correctly reads action groups and resolves `namedConfiguration`
debug lookups from workspace-file-level settings.

## workspace02

Multi-root workspace. Open `workspace02/dir00/example02.code-workspace` in VS Code.

Action groups are defined **only** in each folder's `.vscode/settings.json`; the
`.code-workspace` file has empty settings. `dir00` has a simple terminal action; `dir01`
has debug sessions using `namedConfiguration`, the `workspaceName` qualifier, and
`newConfiguration`. Tests per-folder settings in a multi-root environment.

## workspace03

Multi-root workspace. Open `workspace03/dir00/example03.code-workspace` in VS Code.

An action group is defined in the `.code-workspace` file; both workspace folders have
empty `.vscode/settings.json` files. Tests action groups defined exclusively at the
workspace level when folders contribute no settings of their own.

## workspace04

Multi-root workspace. Open `workspace04/dir00/example04.code-workspace` in VS Code.

Action groups are defined in the `.code-workspace` file **and** in each folder's
`.vscode/settings.json`. Tests that action groups from all levels are merged and
appear together in the QuickPick.

## workspace05

Single-directory workspace. Open the `workspace05/` folder directly in VS Code.

Extensive process-focused testing. Covers: single process, parallel processes (multiple
`processes` entries), sequential commands (`commands` array), env variable injection via
`extendedOptions`, `hideProcessEndMessage`, custom `processEndMessage` with
`${returnCode}`, `delayProcess`, `requestUserInputArguments`, stdio handling,
line-ending behaviour, `fileAssociation`, and `defaultProcessDebugTemplate`.

## workspace06

Single-directory workspace. Open the `workspace06/` folder directly in VS Code.

Process debugging scenarios:
- **Example0**: Process with no debug option — verifies baseline behaviour.
- **Example1**: Process with a per-process `debugTemplate` — prompts to optionally
  convert the process to a debug session on execution.
- **Example2**: Multiple processes sharing a `defaultProcessDebugTemplate` — any
  process without its own `debugTemplate` inherits the group-level template.
- **Example3**: Mixed group with processes and a terminal; the terminal uses
  `useProcessDefaultDebugConfig: true` so it can also be launched as a debug session
  via `defaultProcessDebugTemplate`.

## workspace07

Single-directory workspace. Open the `workspace07/` folder directly in VS Code.

Tests hierarchical group nesting and custom ordering. Action groups use `groupNames` to
place themselves inside named parent groups, forming a directory-like QuickPick
hierarchy. `sortingIndex` controls position within each level. Some items appear as
both a group container and a sibling entry, demonstrating how the nesting algorithm
handles mixed membership.

## workspace08

Single-directory workspace. Open the `workspace08/` folder directly in VS Code.

Tests `${file}` variable resolution when the active tab is a webview. Open
`sample.svg` — VS Code renders it as a webview rather than a text editor — then run
"Echo active file path". The terminal should print the full path to `sample.svg`,
confirming the `TabInputCustom` fallback in the variable substitution logic works
correctly.

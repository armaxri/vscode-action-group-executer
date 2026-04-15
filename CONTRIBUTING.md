# Action Group Executer — Contributing

## Prerequisites

* Node.js (LTS) and npm
* VS Code 1.113.0 or later

## Setup

```bash
npm install      # install dependencies
npm run compile  # compile TypeScript to out/
```

## Running the extension

Open the **Run and Debug** panel (`Ctrl+Shift+D`) and choose one of the launch configurations:

| Configuration | Description |
|---|---|
| **Run Extension (no other extensions)** | Launches a new VS Code window with all installed extensions disabled. Only the dev build is active. Simplest option to avoid conflicts with an installed release copy. |
| **Run Extension (dev profile)** | Launches under a dedicated `age-dev` VS Code profile. The profile starts empty (no extensions installed), so the release copy never conflicts. Settings and extensions you add to the profile persist across sessions. |
| **Extension Tests** | Compiles and runs the Mocha test suite inside the VS Code extension host. |

Both extension launch configs run the default build task (`npm run watch`) before starting, so your latest changes are always compiled before the host opens.

A banner notification "Action Group Executer: DEV BUILD loaded" appears on startup when the dev build (version `99.99.99`) is active, confirming the correct build is loaded.

## Making changes

* The TypeScript watch compiler (`npm run watch`) keeps `out/` up to date while you work.
* After changing source files, reload the extension host window with `Ctrl+R` (`Cmd+R` on macOS) — no need to relaunch the debugger.
* To fully restart the debugger, use the restart button in the debug toolbar.

## Running tests

Select **Extension Tests** in the Run and Debug panel and press `F5`. Test output appears in the Debug Console. Tests use Mocha via `@vscode/test-electron` and run inside a real VS Code instance.

```bash
npm test   # compile, lint, then run the full test suite from the terminal
npm run lint   # lint only
```

## Test workspaces

The `test_workspaces/` directory contains ready-made workspaces for manual testing. Open them in the extension development host to exercise specific scenarios. See [`test_workspaces/README.md`](test_workspaces/README.md) for a description of each workspace.

## Building a VSIX package

A VSIX is the self-contained package file used to distribute or install the extension manually.

```bash
npx @vscode/vsce package
```

This compiles the extension (runs `vscode:prepublish` → `npm run compile`) and produces a `.vsix` file in the project root, e.g. `action-group-executer-1.0.1.vsix`.

To install it locally in VS Code:

```bash
code --install-extension action-group-executer-<version>.vsix
```

Or via the Extensions panel: **⋯ → Install from VSIX…** and select the file.

> **Note:** Before packaging, make sure the `version` field in `package.json` is set to the intended release version, not `99.99.99`.

## Publishing to the Marketplace

```bash
npx @vscode/vsce publish
```

This requires a Personal Access Token (PAT) for the `armaxri` publisher. See the [vsce publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for setup instructions.

## Project structure

| Path | Purpose |
|---|---|
| `src/extension.ts` | Entry point — registers the 5 commands |
| `src/configuration.ts` | Parses VS Code settings into typed class instances |
| `src/terminal.ts` | Creates/reuses terminals and sends commands |
| `src/process.ts` | Spawns background processes, captures output to document tabs |
| `src/debugSession.ts` | Starts VS Code debug sessions |
| `src/utils.ts` | Variable substitution, argument splitting, user input prompts |
| `src/test/` | Mocha test suite |
| `test_workspaces/` | Manual test workspaces |

## Useful links

* [VS Code Extension API](https://code.visualstudio.com/api)
* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
* [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

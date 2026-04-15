# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile       # Compile TypeScript to out/
npm run watch         # Watch and recompile on changes
npm run lint          # Run ESLint on src/
npm test              # Compile, lint, then run Mocha tests via VS Code electron runner
```

To debug/run the extension interactively, use the "Run Extension" launch config in `.vscode/launch.json` (opens a new VS Code window with the extension loaded).

## Architecture

This is a VS Code extension that lets users trigger multiple actions simultaneously — terminals, background processes, and debug sessions — organized into named "action groups".

**Entry point**: `src/extension.ts` registers 5 commands and delegates to the other modules.

**Core modules**:
- `src/configuration.ts` — All configuration parsing. Reads VS Code settings and constructs typed class instances (`ActionGroup`, `TerminalAction`, `ProcessAction`, `ProcessCommand`, `DebugSession`). This is the largest and most central file.
- `src/terminal.ts` — Creates/reuses VS Code terminals and sends commands to them.
- `src/process.ts` — Spawns background child processes, captures output to file-backed document tabs, manages a registry of running processes keyed by document URI.
- `src/debugSession.ts` — Starts VS Code debug sessions from named or inline configurations.
- `src/utils.ts` — String utilities: variable substitution (`${file}`, `${env:VAR}`, VS Code predefined vars), argument splitting with quote/escape handling, user input prompts.

**Configuration hierarchy**: `ActionGroup` contains arrays of `TerminalAction`, `ProcessAction`, and an optional `DebugSession`. Groups can be nested hierarchically (directory-like structure). The `ActionGroupPickGroup` class handles the QuickPick UI for selecting groups.

**Variable substitution** is applied recursively to command strings before execution. The `splitArguments()` function in `utils.ts` handles complex shell quoting/escape sequences — this logic has its own dedicated test file.

## Testing

Tests use Mocha via `@vscode/test-electron`. Test workspaces live in `test_workspaces/`. The test suite at `src/test/suite/utilsStringAdjustment.test.ts` has the most coverage (argument parsing edge cases).

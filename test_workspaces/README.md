# Test Workspaces

To test the plugin in different environment, this directory contains workspace setups for testing and reproduction. The workspaces use python examples to keep things simple.

## workspace00

Single directory workspace designed to test all basic scenario's.

## workspace01

Workspace with two directories holding settings and run configuration in the workspace file.

## workspace02

Workspace with two directories holding settings and run configuration in the workspace directories.

## workspace03

Workspace with two directories holding settings in the workspace file and run configurations in the workspace directories.

## workspace04

A workspace using two directories holding settings in the workspace file and in the settings file, designed to test the merged settings.

## workspace05

Simple one directory workspace to test processes intensively.

## workspace06

Simple one directory workspace to test process debugging functionality.

## workspace07

Single directory workspace to test hierarchical group nesting via `groupNames` and custom ordering via `sortingIndex`. Groups are configured to belong to other groups, forming a nested pick hierarchy with controlled sort positions.

## workspace08

Single directory workspace to test `${file}` variable resolution when the active tab is a webview (non-text editor). Open `sample.svg` — VS Code renders it as a webview — then run "Echo active file path". The terminal should print the full path to `sample.svg`, confirming the `TabInputCustom` fallback in the variable substitution logic works correctly.

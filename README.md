# Action Group Executer

The "action-group-executer" extension lets you trigger multiple actions simultaneously from a single VS Code command — start several terminals, launch background processes, and kick off debug sessions all at once. It is designed around workflows where a fixed set of tasks needs to be started together, and extends over time based on real-world usage needs.

## Features

Use `ActionGroupExec: Execute Action Group` (default keybinding: `Ctrl+Shift+A` / `Cmd+Shift+A`) to pick and run a configured action group.

The following settings illustrate the full range of available options:

```jsonc
{
    "actionGroupExecuter.defaultProcessEndMessage": "\n\nStop of work!",
    "actionGroupExecuter.defaultFileAssociation": "log",
    "actionGroupExecuter.defaultShowActionSource": false,
    "actionGroupExecuter.actionGroups": [
        {
            "name": "Example1",
            "terminals": [
                {
                    // Optional name of the terminal window.
                    // If not set it will use the action name.
                    "name": "Window1Name",
                    "command": "echo Hello",
                    // Force the extension to create new terminal
                    // instances. If a terminal with the name
                    // "Window1Name" exists a new terminal with the
                    // name "Window1Name (1)" will be created.
                    "alwaysNewTerminal": true,
                    // If set pushes the terminal in the front.
                    "showTerminal": true
                },
                {
                    "name": "Window2Name",
                    "command": "echo Hello",
                    // The command will be delayed by 5000 ms.
                    "delayCommand": 5000,
                    // If a terminal with the name "Window2Name"
                    // already exists, the instance will be
                    // destroyed and replaced by a new instance
                    // with the same name.
                    "disposeOldTerminal": true
                }
            ]
        },
        {
            "name": "Example2",
            "terminals": [{
                // There is no need for a name since there
                // is only one command. And the group
                // name is enough.
                "command": "echo Hello && sleep 5 && echo Hallo"
            }],
            // Debug the selected python file.
            "debugSession": {
                // Use a standard launch configuration and place it
                // under "newConfiguration" for execution.
                "newConfiguration": {
                    "name": "debug_test_file",
                    "type": "python",
                    "request": "launch",
                    "program": "${file}",
                    "console": "integratedTerminal"
                }
            }
        },
        {
            "name": "Example3",
            "terminals": [{
                "command": "echo Hallo && sleep 5 && cat ${file}",
                // "extendedOptions" is used to simply pass
                // arguments to the VS Code terminal creation
                // function.
                "extendedOptions": {
                    "name": "Example3Override",
                    "cwd": "C:\\"
                }
            }],
            // Debug with a given launch configuration by it's name.
            "debugSession": {
                // Specify the launch configuration by it's name.
                "namedConfiguration": "test00_file",
                // Optionally add a workspace name, which is useful
                // in multi root workspace environments to get
                // a guaranteed workspace for the execution.
                "workspaceName": "dir00",
                // Optionally add a delay to allow terminal tasks
                // to setup your execution environment.
                "delaySession": 10000
            }
        },
        {
            // ${env:HOME} will be replaced with the content of the
            // environment variable.
            "name": "Example4 - list files in ${env:HOME}",
            // Get environment variables for your commands.
            "terminals": [{ "command": "ls -la ${env:HOME}" }]
        },
        {
            "name": "Example5 - ls -la ${env:HOME}",
            // This will open a new file tab and paste the stdout content into the tab.
            "processes": [{
                "command": {
                    // Note that the command and all arguments are separated strings.
                    "call": [ "ls", "-la", "${env:HOME}" ],
                    // Print nothing after the end of the process.
                    "hideProcessEndMessage": true
                }
            }]
        },
        {
            "name": "Example5 - ls -la ${env:HOME} and / in sequence",
            "processes": [{
                // Print the command just starting with the arguments.
                "printCommand": true,
                // Select the way to display the output.
                "fileAssociation": "plaintext",
                // Note that each command group will be spawned in the same file tab.
                "commands": [
                    {
                        // Note that "$HOME" will not work but "${env:HOME}" is a valid alternative.
                        "call": [ "ls", "-la", "${env:HOME}" ],
                        "processEndMessage": "\nEnded first process!"
                    },
                    {
                        "call": [ "ls", "-la" ],
                        // Use the "extendedOptions" to directly access node.js spawn process
                        // "SpawnOptionsWithoutStdio" setting for configuration of the execution.
                        "extendedOptions": {
                            "cwd": "${workspaceFolder}",
                            "env": { "TEST_WORLD": "Hello World." }
                        },
                        "processEndMessage": "\nEnded second process! Return code was ${returnCode}."
                    }
                ]
            }]
        },
        {
            "name": "Example6 - ls -la ${env:HOME} and / in parallel",
            "processes": [{
                // Note that each command group will be spawned in a separate file tab.
                "command": {
                    "call": [ "ls", "-la", "${env:HOME}" ],
                    "processEndMessage": "\nEnded first process!"
                },
                // Print this given name at the start of the process.
                "name": "ls in home ${env:HOME}"
            },
            {
                // Print name of the whole command group at start of process.
                "printName": true,
                "command": {
                    "call": [ "ls", "-la" ],
                    // Use the "extendedOptions" to directly access node.js spawn process
                    // "SpawnOptionsWithoutStdio" setting for configuration of the execution.
                    "extendedOptions": {
                        "cwd": "${workspaceFolder}",
                        "env": { "TEST_WORLD": "Hello World." }
                    },
                    "processEndMessage": "\nEnded second process! Return code was ${returnCode}."
                }
            }]
        },
        {
            // When an action group has processes with debug templates, executing it
            // prompts you to optionally convert each eligible process to a debug
            // session instead of running it as a background process.
            //
            // defaultProcessDebugTemplate is a group-level fallback: any process
            // that does NOT have its own debugTemplate inherits this one.
            // A per-process debugTemplate always takes priority over the fallback.
            // The process program and args are merged into the template automatically.
            "name": "Example7 - Debug python processes",
            "processes": [
                {
                    // No debugTemplate — inherits defaultProcessDebugTemplate below.
                    "command": {
                        "name": "Process 1",
                        "call": [ "./script1.py" ],
                        "extendedOptions": { "cwd": "${workspaceFolder}" }
                    }
                },
                {
                    // No debugTemplate — inherits defaultProcessDebugTemplate below.
                    "command": {
                        "name": "Process 2",
                        "call": [ "./script2.py", "arg1", "arg2" ],
                        "extendedOptions": { "cwd": "${workspaceFolder}" }
                    }
                },
                {
                    "command": {
                        "name": "Process 3",
                        "call": [ "./script3.py" ],
                        "extendedOptions": { "cwd": "${workspaceFolder}" }
                    },
                    // Per-process debugTemplate takes priority over the group-level
                    // defaultProcessDebugTemplate for this process only.
                    "debugTemplate": {
                        "type": "python",
                        "request": "launch"
                    }
                }
            ],
            // Fallback debug configuration used by Process 1 and Process 2.
            "defaultProcessDebugTemplate": {
                "type": "python",
                "request": "launch",
                "console": "integratedTerminal"
            }
        },
        {
            // useProcessDefaultDebugConfig on a terminal action lets that terminal
            // be converted to a debug session instead of running in a terminal,
            // using the group's defaultProcessDebugTemplate as the base config.
            // The command string is split into program + args automatically.
            "name": "Example7b - Debug a terminal as a process",
            "terminals": [
                {
                    "name": "Run script",
                    "command": "./script.py --verbose",
                    // When true, this terminal can optionally be launched as a
                    // debug session using defaultProcessDebugTemplate below.
                    "useProcessDefaultDebugConfig": true,
                    "extendedOptions": { "cwd": "${workspaceFolder}" }
                }
            ],
            "defaultProcessDebugTemplate": {
                "type": "python",
                "request": "launch",
                "console": "integratedTerminal"
            }
        },
        {
            // groupNames places this action inside a named group in the QuickPick list,
            // creating a directory-like hierarchy. sortingIndex controls ordering within
            // that level (lower numbers appear first; default is 9999999).
            "name": "Example8 - Start server",
            "groupNames": [
                { "name": "Backend", "sortingIndex": 1 }
            ],
            "sortingIndex": 1,
            "terminals": [{ "command": "echo Starting backend server..." }]
        },
        {
            "name": "Example8 - Start client",
            "groupNames": [
                { "name": "Frontend", "sortingIndex": 2 }
            ],
            "sortingIndex": 1,
            "terminals": [{ "command": "echo Starting frontend client..." }]
        }
    ]
}
```

`ActionGroupExec: Kill current Background Process` can be used to kill the process behind the currently selected document. For the extreme case use `ActionGroupExec: Kill all Background Processes` to kill all processes.

With the command `ActionGroupExec: Select a current Background Process and Control It` processes that are currently running can be selected and controlled, including sending kill signals or arbitrary input.

Due to the interface the extension is limited to only execute one command on the command line. Combinations of different commands need additional scripts or functions like `echo Hello1 && sleep 10 && echo Hello2`. As terminal `extendedOptions` the [VS Code TerminalOptions](https://code.visualstudio.com/api/references/vscode-api#TerminalOptions) can be used to pass VS Code terminal construction settings directly.

All elements can be configured using a subset of [VS Code predefined variables](https://code.visualstudio.com/docs/editor/variables-reference). The supported predefined variables are:
`${cwd}`, `${fileBasenameNoExtensions}`, `${fileBasename}`, `${fileDirname}`, `${fileExtname}`, `${file}`, `${lineNumber}`, `${pathSeparator}`, `${relativeFileDirname}`, `${relativeFile}`, `${selectedText}`, `${workspaceFolderBasename}` and `${workspaceFolder}`.
An additional `${env:<add env var name here>}` was added to allow the usage of environment variables.

`${file}` and related file variables are resolved from the active text editor. When a non-text tab is active (e.g. an image viewer or SVG preview that renders as a webview), the file path is resolved from the active tab's input instead, so the variables still refer to the correct file.

Processes allow adjustments of the `processEndMessage` in terms of replacing the pattern `${returnCode}` with the process return code.

The debug sessions `newConfiguration` and the `extendedOptions` for the terminals support the full [VS Code predefined variables](https://code.visualstudio.com/docs/editor/variables-reference) set.

## Extension Settings

| Setting | Description |
|---|---|
| `actionGroupExecuter.actionGroups` | List of action groups to execute. |
| `actionGroupExecuter.defaultProcessEndMessage` | Message appended to process output tabs when a process ends. Supports `${returnCode}`. |
| `actionGroupExecuter.defaultFileAssociation` | Default language/file-type used for process output tabs (e.g. `plaintext`, `log`). |
| `actionGroupExecuter.defaultShowActionSource` | Toggle whether the settings source (user/workspace) is shown in the QuickPick label. |

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for the full history.

## Known Issues

* User input is currently not using the vscode `validateInput` argument to validate the user input and give feedback.
* Process execution is not saved when a window is closed.
* In processes resolving of environment variables like `$HOME` will not work and will just be interpreted as strings. Use `${env:HOME}` instead.
* File tabs for processes are created with a 500 ms delay. Otherwise VS Code will fail creating the next window.
* When starting a debugger, VS Code will ask to save the currently selected file.
* When debugging a process, the output is no longer written to a file tab but instead to the debug console.
* If commands are used spawning several processes after another, they will not check the return code of the previous process exit. How an end should be configured is still to decide.

## Requirements

Not applying (yet).

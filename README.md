# Action Group Executer

The "action-group-executer" is designed to easily trigger different actions in your VS Code instance. The first major function is to start different terminal sessions at the same time.

This extension might share similarities with other existing extensions (well "might shares" is a nice alternative for "is sharing"). It's developed taking certain workflows useful for one company in mind and extended based on the needs of users in similar environments. Therefore extensions are added based on new experiences within the given workflow.

## Features

The following settings can be set and enter `ActionGroupExec: Execute Action Group` as command to select your prepared settings:

```jsonc
{
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
            "terminals": [
                {
                    // There is no need for a name since there
                    // is only one command. And the group
                    // name is enough.
                    "command": "echo Hello && sleep 5 && echo Hallo"
                }
            ],
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
            "terminals": [
                {
                    "command": "echo Hallo && sleep 5 && cat ${file}",
                    // "extendedOptions" is used to simply pass
                    // arguments to the VS Code terminal creation
                    // function.
                    "extendedOptions": {
                        "name": "Example3Override",
                        "cwd": "C:\\"
                    }
                }
            ],
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
            "terminals": [
                {
                    // Get environment variables for your commands.
                    "command": "ls -la ${env:HOME}"
                }
            ]
        },
        {
            "name": "Example5 - ls -la ${env:HOME}",
            // This will open a new file tab and past the stout content into the tab.
            "processes": [{
                "command": {
                    // Note that the command and all arguments are separated strings.
                    "call": [
                        "ls",
                        "-la",
                        "${env:HOME}"
                    ]
                }
            }]
        },
        {
            "name": "Example5 - ls -la ${env:HOME} and / in parallel",
            "processes": [{
                // Note that each command group will be spawned in a separate file tab.
                "commands": [
                    {
                        "call": [
                            "ls",
                            "-la",
                            // Note that "$HOME" will not work but "${env:HOME}" is a valid alternative.
                            "${env:HOME}"
                        ]
                    },
                    {
                        "call": [
                            "ls",
                            "-la"
                        ],
                        // Use the "extendedOptions" to directly access node.js spawn process
                        // "SpawnOptionsWithoutStdio" setting for configuration of the execution.
                        "extendedOptions": {
                            "cwd": "${workspaceFolder}",
                            "env": {
                                "TEST_WORLD": "Hello World."
                            }
                        }
                    }
                ]
            }]
        }
    ]
}
```

Due to the interface the extension is limited to only execute one command on the command line. Combinations of different commands need additional scripts or functions like `echo Hello1 && sleep 10 && echo Hello2`. As terminal `extendedOptions` the [VS Code TerminalOptions](https://code.visualstudio.com/api/references/vscode-api#TerminalOptions) can be used to use the exposed VS Code terminal construction settings.

All elements can be configured using a subset of [VS Code predefined variables](https://code.visualstudio.com/docs/editor/variables-reference). The supported predefined variables are:
`${cwd}`, `${fileBasenameNoExtensions}`, `${fileBasename}`, `${fileDirname}`, `${fileExtname}`, `${file}`, `${lineNumber}`, `${pathSeparator}`, `${relativeFileDirname}`, `${relativeFile}`, `${selectedText}`, `${workspaceFolderBasename}` and `${workspaceFolder}`.
An additional `${env:<add env var name here>}` was added to allow the usage of environment variables.

The debug sessions `newConfiguration` and the `extendedOptions` for the terminals support the full [VS Code predefined variables](https://code.visualstudio.com/docs/editor/variables-reference) set.

## Extension Settings

At the moment the extension supports only supports a simply configuration of groups. Execution groups can be added under the `actionGroupExecuter.actionGroups` setting.

## Release Notes

### 0.0.6

* Output of stderr is handled in processes.

### 0.0.5

* Added configuration of processes.
* Improvements of documentation.

### 0.0.4

* Fixed documentation.

### 0.0.3

* Added process execution with output to file tabs.
* Fixed double inclusion of groups when no workspace file is used.
* Added variables for configuration.
* Show terminal is now the new default setting.

### 0.0.2

* Changed the command to start the execution.
* Added autocompletion and documentation for the settings.
* The action group arrays are now merged over the different setting groups (user, workspace file and workspace folder).
* Now debug sessions can be started in the same row as terminal actions (start a server with terminal and debug a client or vice versa).

### 0.0.1

Initial release of Action Group Executer.

## Known Issues

* Process execution is not saved when a window is close.
* In processes resolving of environment variables like `$HOME` will not work and will just be interpreted as strings. Use `${env:HOME}` instead.

## Requirements

Not applying (yet).

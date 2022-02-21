# Action Group Executer

The "action-group-executer" is designed to easily trigger different actions in your VS Code instance. The first major function is to start different terminal sessions at the same time.

This extension might share similarities with other existing extensions (well "might shares" is a nice alternative for "is sharing"). It's developed taking certain workflows useful for one company in mind and extended based on the needs of users in similar environments. Therefore extensions are added based on new experiences within the given workflow.

## Features

The following settings can be set and enter `ActionGroupExec: Execute Action Group` as command to select your prepared settings:

```jsonc
{
    "actionGroupExecuter.defaultProcessEndMessage": "\n\nStop of work!",
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
            // This will open a new file tab and past the stout content into the tab.
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
            "name": "Example5 - ls -la ${env:HOME}",
            // This will open a new file tab and past the stout content into the tab.
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
            "name": "Example7 - Debug python processes",
            "processes": [
                {
                    "command": {
                        "name": "Process 1",
                        "call": [ "./script1.py" ],
                        "extendedOptions": { "cwd": "${workspaceFolder}" }
                    }
                },
                {
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
                    // This process has a debug template, which is used merged with the
                    // process setting to create a debug session.
                    "debugTemplate": {
                        "type": "python",
                        "request": "launch"
                    }
                }
            ],
            // These settings are used together with the settings of process 1 and 2
            // to create a debug session if selected.
            "defaultProcessDebugTemplate": {
                "type": "python",
                "request": "launch",
                "console": "integratedTerminal"
            }
        }
    ]
}
```

`ActionGroupExec: Kill current Background Process` can be used to kill the process behind the currently selected document. For the extreme case use `ActionGroupExec: Kill all Background Processes` to kill all processes.

With the command `ActionGroupExec: Select a current Background Process and Control It` processes that are currently running can be selected and can be controlled like sending kill commands.

Due to the interface the extension is limited to only execute one command on the command line. Combinations of different commands need additional scripts or functions like `echo Hello1 && sleep 10 && echo Hello2`. As terminal `extendedOptions` the [VS Code TerminalOptions](https://code.visualstudio.com/api/references/vscode-api#TerminalOptions) can be used to use the exposed VS Code terminal construction settings.

All elements can be configured using a subset of [VS Code predefined variables](https://code.visualstudio.com/docs/editor/variables-reference). The supported predefined variables are:
`${cwd}`, `${fileBasenameNoExtensions}`, `${fileBasename}`, `${fileDirname}`, `${fileExtname}`, `${file}`, `${lineNumber}`, `${pathSeparator}`, `${relativeFileDirname}`, `${relativeFile}`, `${selectedText}`, `${workspaceFolderBasename}` and `${workspaceFolder}`.
An additional `${env:<add env var name here>}` was added to allow the usage of environment variables.

Processes allow adjustments of the `processEndMessage` in terms of replacing the pattern `${returnCode}` with the process return code.

The debug sessions `newConfiguration` and the `extendedOptions` for the terminals support the full [VS Code predefined variables](https://code.visualstudio.com/docs/editor/variables-reference) set.

## Extension Settings

Execution groups can be added under the `actionGroupExecuter.actionGroups` setting. `actionGroupExecuter.defaultProcessEndMessage` can be used to define a user specific message that is displayed after the execution of a process which output is placed the file tab.

## Release Notes

### [Unreleased]

* Default key binding to trigger group start.
* Use the current file editor for scrolling down on processes.

### 0.0.9

* Printing of process names into the document at start.
* Printing of process calls.
* Added kill command for the process behind the selected document.
* Added commando to kill all processes running at the moment.
* Select processes via command and kill them.
* Select processes via command and send some input.
* Added send some input to the process behind the selected document.
* Added debugging of processes by converting processes to debug sessions using templates.
* Error handling for processes was added.
* Kill all processes when the window is closed.

### 0.0.8

* On process execution, the file tab will automatically scroll down when you have selected the last line in the file tab.
* Added string replacement for `processEndMessage` printing the return code of the process.
* Changed the default `processEndMessage` to print the return code of the process.
* Replace `\r\n` with `\n` of process output, so on Windows no double new lines are displayed on Windows.

### 0.0.7

* Added process end messages after the process execution.
* Ensured that file tabs are kept opened when the processes have a delayed start.

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
* File tabs for processes are created with a 500 ms delay. Otherwise VS Code will fail creating the next window.
* When starting a debugger, VS Code will ask to safe the currently selected file.

## Requirements

Not applying (yet).

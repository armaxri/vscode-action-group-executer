# Change Log

## [Unreleased]

### Added

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

## [0.0.8]

### Added

* Added string replacement for `processEndMessage` printing the return code of the process.
* On process execution, the file tab will automatically scroll down when you have selected the last line in the file tab.

### Changed

* Changed the default `processEndMessage` to print the return code of the process.
* Replace `\r\n` with `\n` of process output, so on Windows no double new lines are displayed on Windows.

## [0.0.7]

### Added

* Added process end messages after the process execution.

### Fixed

* Ensured that file tabs are kept opened when the processes have a delayed start.

## [0.0.6]

### Fixed

* Output of stderr is handled in processes.

## [0.0.5]

### Added

* Added configuration of processes.

### Fixed

* Improvements of documentation.

## [0.0.4]

### Fixed

* Fixed displayed version.

## [0.0.3]

### Added

* Added variables for the configuration.
* Process execution with output to file tabs.

### Changed

* Show terminal is now the new default setting.

### Fixed

* Fixed double inclusion of groups when no workspace file is used.

## [0.0.2]

### Added

* Added autocompletion and documentation for the settings.
* Now debug sessions can be started in the same row as terminal actions (start a server with terminal and debug a client or vice versa).

### Changed

* Changed the command to start the execution.
* The action group arrays are now merged over the different setting groups (user, workspace file and workspace folder).

## [0.0.1]

Initial release of Action Group Executer.

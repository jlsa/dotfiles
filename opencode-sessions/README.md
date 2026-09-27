# OpenCode Session Picker

A terminal user interface (TUI) for finding and resuming previous OpenCode
sessions. This project can later become part of your own dotfiles.

## What are dotfiles?

Many configuration files on macOS and Linux start with a dot, such as `.zshrc`
and `.gitconfig`; hence the name *dotfiles*. People often keep these files and
personal scripts together in a Git repository. This puts their terminal setup
under version control and makes it quick to install on a new computer.

This project fits that setup well: `bin/ocs` is the script, and `install.sh`
creates a symbolic link in `~/.local/bin`. The link points to the file in the
repository, so changes take effect immediately.

## Installation

```sh
./install.sh
```

Make sure `~/.local/bin` is in your `PATH`. The installer will let you know if
it is not. Then open a new terminal or reload your shell configuration.

## Usage

```sh
ocs
```

You will see a searchable list of recent sessions. Type to filter the list,
use the arrow keys to select a session, and press Enter to open OpenCode in the
correct project directory and resume the session. Press Escape once to clear
the search and again to close the TUI.

You can pre-filter the list using part of a title or directory name:

```sh
ocs invoices
```

The interface is built with [OpenTUI](https://opentui.com), the same terminal
UI foundation used by OpenCode. Bun is used as the runtime.

## Details

- Reads `~/.local/share/opencode/opencode.db` by default.
- Does not modify or delete sessions.
- Shows only active top-level sessions, not internal subsessions.
- Use `OPENCODE_DB=/another/path/opencode.db ocs` to select a different
  database.

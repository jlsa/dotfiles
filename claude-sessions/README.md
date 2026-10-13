# Claude Code Session Picker

A terminal user interface (TUI) for finding and resuming previous Claude Code
sessions. It is the Claude Code counterpart of the
[OpenCode Session Picker](../opencode-sessions/README.md).

## Installation

```sh
./install.sh
```

Make sure `~/.local/bin` is in your `PATH`. The installer will let you know if
it is not. Then open a new terminal or reload your shell configuration.

## Usage

```sh
ccs
```

You will see a searchable list of recent sessions across all projects. Type to
filter the list, use the arrow keys to select a session, and press Enter to
open Claude Code in the correct project directory and resume the session. Press
Escape once to clear the search and again to close the TUI.

You can pre-filter the list using part of a title or directory name:

```sh
ccs invoices
```

The interface is built with [OpenTUI](https://opentui.com). Bun is used as the
runtime.

## Details

- Reads the session transcripts in `~/.claude/projects` by default.
- Does not modify or delete sessions.
- Uses the session name (`/rename`), then the generated title, then the first
  prompt as the title. Subagent transcripts are not listed.
- Use `CLAUDE_PROJECTS_DIR=/another/path ccs` to select a different directory.

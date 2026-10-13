# Dotfiles

Personal command-line tools and configuration, kept under version control for
easy reuse across machines.

## Included tools

### OpenCode Session Picker

`opencode-sessions` provides the `ocs` command: a searchable terminal interface
for finding and resuming previous OpenCode sessions.

See [opencode-sessions/README.md](opencode-sessions/README.md) for installation,
usage, and development details.

### Claude Code Session Picker

`claude-sessions` provides the `ccs` command: the same searchable interface for
finding and resuming previous Claude Code sessions.

See [claude-sessions/README.md](claude-sessions/README.md) for details.

### dffr

`dffr` provides the `dffr` command: a terminal UI that compares two clipboard
entries side by side, as unified diffs or as plain text, and keeps a history of
what you compared.

See [dffr/README.md](dffr/README.md) for details.

### kmd

`kmd` provides the `kmd` command: a terminal UI for tracking office days per
month and exporting them as a kilometre claim. It can mark office days
automatically when your Mac is on the office network.

See [kmd/README.md](kmd/README.md) for details.

## Setup

Clone the repository, then install each tool from its own directory. For the
OpenCode Session Picker:

```sh
git clone <repository-url> ~/Developer/dotfiles
cd ~/Developer/dotfiles/opencode-sessions
./install.sh
```

The installer creates a symbolic link in `~/.local/bin`, so make sure that
directory is included in your `PATH`.

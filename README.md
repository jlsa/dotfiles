# Dotfiles

Personal command-line tools and configuration, kept under version control for
easy reuse across machines.

## Included tools

### OpenCode Session Picker

`opencode-sessions` provides the `ocs` command: a searchable terminal interface
for finding and resuming previous OpenCode sessions.

See [opencode-sessions/README.md](opencode-sessions/README.md) for installation,
usage, and development details.

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

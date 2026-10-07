# dffr

`dffr` is a local terminal UI for comparing two clipboard entries side by
side. It recognises unified diffs, and also compares ordinary plain text. No
source code is sent anywhere.

## Install

```sh
cd dffr
./install.sh
```

This installs a `dffr` symlink in `~/.local/bin`. Ensure that directory is on
your `PATH`.

## Use

1. Copy a unified diff (for example, the output of `git diff`) or any plain
   text.
2. Start `dffr`, then press `l` to load it on the left.
3. Copy the other unified diff and press `r` to load it on the right.
4. Use the arrow keys to select a file. The matching file is shown in both
   panes; a message indicates when it only exists on one side.

For two plain-text clipboard entries, unchanged lines are aligned. A `-` in
the left pane is a removed line; a `+` in the right pane is an added line.

### Shortcuts

| Key | Action |
| --- | --- |
| `l` | Load the clipboard into the left pane |
| `r` | Load the clipboard into the right pane |
| `↑` / `↓` | Select a file |
| `q` / `Esc` | Quit |

## Development

```sh
bun install
bun test
bun run check
```

The clipboard loader implements the `DiffSource` interface. Future file, Git,
or URL loaders can implement the same interface without changing the parser or
the TUI.

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

For two plain-text clipboard entries, unchanged lines are aligned. A red `-`
line in the left pane was removed; a green `+` line in the right pane was
added. When a line was changed rather than removed or added, both versions are
shown on the same row and the characters that differ are highlighted in bold
with a stronger background colour. Each line shows its own line number from
the original text; filler rows that only keep the panes aligned have none.

### History

Every text you load from the clipboard is saved, so you can compare it again
later. Press `h` to show the history instead of the file list and choose an
entry with `↑` / `↓`.

- `Enter` opens the entry on the side it was loaded on, together with the text
  that was on the other side at that moment.
- `l` or `r` loads only this entry on the left or right.
- `/` searches the full text of every entry. Press `Enter` to keep the results
  and choose from them, or `Esc` to clear the search.
- `d` deletes the entry; press `d` again to confirm.
- `h` or `Esc` goes back to the file list.

The history is stored only on this machine, one JSON object per line, in
`$XDG_DATA_HOME/dffr/history.jsonl` (by default
`~/.local/share/dffr/history.jsonl`). Set `DFFR_HISTORY` to use another file.
Loading the same text twice in a row saves it once. Delete the file to clear
the whole history.

### Shortcuts

| Key | Action |
| --- | --- |
| `l` | Load the clipboard (or the chosen history entry) into the left pane |
| `r` | Load the clipboard (or the chosen history entry) into the right pane |
| `s` | Swap the left and right pane |
| `↑` / `↓` | Select a file, or a history entry |
| `h` | Show or hide the history |
| `Enter` | Open a history entry with the text it was compared with |
| `/` | Search the history |
| `d` `d` | Delete a history entry |
| `q` / `Esc` | Quit (`Esc` clears the search and closes the history first) |

## Development

```sh
bun install
bun test
bun run check
```

The clipboard loader implements the `DiffSource` interface. Future file, Git,
or URL loaders can implement the same interface without changing the parser or
the TUI.

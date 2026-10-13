# kmd

`kmd` keeps track of the days you travelled to the office, so you can claim
your kilometres each month. It shows a month in the terminal, exports the days
as CSV, and can mark office days by itself when your Mac is on the office
network. Everything stays on this machine.

## Install

```sh
cd kmd
./install.sh
```

This installs a `kmd` symlink in `~/.local/bin`. Ensure that directory is on
your `PATH`.

Set your round-trip distance once:

```sh
kmd config km 42
```

The rate defaults to € 0,23 per km (`kmd config rate 0.23`). Each day stores
the distance and rate that applied when it was saved, so changing them later
does not change earlier months.

## Use

`kmd` opens the current month. `kmd 2026-09` opens September 2026 and `kmd -1`
opens last month. Every day of the month is listed; office days show a `✓`,
the distance, and whether they were added by hand or automatically.

| Key | Action |
| --- | --- |
| `↑` / `↓` | Select a day |
| `Space` / `Enter` | Add or remove the selected day |
| `k` | Set the distance for the selected day (adds the day if needed) |
| `←` / `→` or `[` / `]` | Previous or next month |
| `m` | Go to a month (`YYYY-MM`, or `-1` for last month) |
| `t` | Go to today |
| `c` | Copy the month to the clipboard as CSV |
| `s` | Save the month to `~/Downloads/kmd-YYYY-MM.csv` |
| `q` / `Esc` | Quit |

### From the command line

```sh
kmd today                      # add today
kmd today --km 10 --note klant # with another distance and a note
kmd add 2                      # the 2nd of this month
kmd add 15-9                   # 15 September of this year
kmd add 2026-09-15
kmd remove 2
kmd list                       # this month as a table
kmd list 2026-09
kmd export --csv               # CSV on stdout
kmd export -1 --copy           # last month as CSV on the clipboard
kmd export 2026-09 --out ~/Downloads/kmd-2026-09.csv
```

The CSV has the columns `date;weekday;km;amount;source;note`, separated by
semicolons with a comma as decimal separator, which Dutch Excel and Numbers
open correctly. The table and the CSV only contain the days you were present.

### Automatic office days

macOS no longer lets scripts read the Wi-Fi name, so `kmd` recognises the
office network by its router (MAC address), DHCP server and domain instead.
No location permission is needed.

1. At the office, save the network: `kmd here --work office`. Run `kmd here`
   at any time to see the current network and whether it is known. Use a
   different label per office; saving again under the same label replaces it.
   `kmd here --list` shows the saved networks with a `✓` next to the one you
   are on now, and `kmd here --forget office` removes one.
2. Install the schedule: `kmd auto install`. This creates a LaunchAgent that
   runs `kmd auto` at 10:00 and 14:00 (`--at 09:30,13:00` for other times). A
   time that is missed because the Mac was asleep runs at the next wake.

`kmd auto` adds today when the Mac is on a work network, today is a workday
(`kmd config workdays 1,2,3,4,5`, ISO weekdays) and the time is within work
hours (`kmd config hours 08:30-17:00`). A day you removed by hand stays
removed. Each run writes one line to `~/Library/Logs/kmd-auto.log`:

```
[2026-10-13 10:00] 2026-10-13: marked  ·  42 km  ·  work network "office"
[2026-10-14 10:00] 2026-10-14: skipped: not a work network
```

`kmd auto status` shows whether the schedule is loaded, `kmd auto uninstall`
removes it, and `kmd auto --force` marks today regardless of the day or time
(useful for a test). To trigger the schedule right away:

```sh
launchctl kickstart gui/$(id -u)/nl.joel.kmd.auto
```

## Data

- Days: `$XDG_DATA_HOME/kmd/days.jsonl` (by default
  `~/.local/share/kmd/days.jsonl`), one JSON object per line; the last line
  for a date is the current state. Set `KMD_DATA` to use another file.
- Settings: `$XDG_CONFIG_HOME/kmd/config.json` (by default
  `~/.config/kmd/config.json`). Set `KMD_CONFIG` to use another file.
- Schedule: `~/Library/LaunchAgents/nl.joel.kmd.auto.plist`.

## Development

```sh
bun install
bun test
bun run check
```

The logic (storage, months, network fingerprint, the `auto` decision and the
LaunchAgent plist) is in pure modules with tests; `tui.ts` and `commands.ts`
only wire them to the screen and the command line.

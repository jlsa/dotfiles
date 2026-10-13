import { writeFileSync } from "node:fs"
import { parseClock, shouldMark } from "./auto"
import * as launchd from "./launchd"
import { formatCsv, formatTable, monthLabel, parseDate, parseMonth, todayKey, weekdayName } from "./month"
import { currentNetwork, describeNetwork, matchNetwork, toKnownNetwork } from "./network"
import { ConfigStore, DayStore, type Config } from "./store"

export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

const valueFlags = new Set(["km", "note", "out", "at"])

/** `--km 42 --csv 13` → positional `["13"]`, flags `{ km: "42", csv: true }`. A lone `-1` stays positional. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s)
    if (valueFlags.has(name)) {
      const value = inline ?? argv[++i]
      if (value === undefined) throw new Error(`--${name} needs a value`)
      flags[name] = value
    } else {
      flags[name] = true
    }
  }
  return { positional, flags }
}

export const usage = `kmd — travel expenses per month

  kmd [YYYY-MM | -1]             month view (default: this month)
  kmd today [--km N] [--note ..]  add today
  kmd add <date> [--km N]         add a day: 2026-10-13, 13-10, 13 or today
  kmd remove <date>               remove a day
  kmd list [month]                days of a month
  kmd export [month] [--csv] [--copy] [--out file]
                                  table, or CSV with --csv; --copy and --out use CSV
  kmd here [--work [label]] [--forget label] [--list]
                                  show the current network; --work saves it as a work network,
                                  --list shows the saved work networks
  kmd auto [--force]              mark today when on a work network during work hours
  kmd auto install [--at 10:00,14:00] | uninstall | status
                                  LaunchAgent that runs "kmd auto" at fixed times
  kmd config [km N | rate N | workdays 1,2,3,4,5 | hours 08:30-17:00]
`

function copyToClipboard(text: string): void {
  const result = Bun.spawnSync(["pbcopy"], { stdin: Buffer.from(text) })
  if (result.exitCode !== 0) throw new Error("Could not write to the clipboard.")
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
}

function distance(config: Config, flag: string | true | undefined): number {
  if (typeof flag === "string") {
    const km = Number(flag.replace(",", "."))
    if (!Number.isFinite(km) || km <= 0) throw new Error(`Not a distance: ${flag}`)
    return km
  }
  if (config.km <= 0) throw new Error("Set your distance first: kmd config km <km>  (or pass --km)")
  return config.km
}

function describeConfig(config: Config): string {
  const lines = [
    `km        ${config.km || "(not set)"}`,
    `rate      ${config.rate} €/km`,
    `workdays  ${config.workdays.join(",")}`,
    `hours     ${config.workHours.start}-${config.workHours.end}`,
    `networks  ${config.networks.length === 0 ? "(none, run: kmd here --work)" : ""}`,
  ]
  for (const network of config.networks) lines.push(`          ${network.label}: ${describeNetwork(network)}`)
  return lines.join("\n")
}

/** Run a non-interactive command. Returns the exit code; output goes to stdout. */
export function run(argv: string[], now = new Date()): number {
  const { positional, flags } = parseArgs(argv)
  const [command, ...rest] = positional
  const config = new ConfigStore()
  const days = new DayStore()

  switch (command) {
    case "help":
    case undefined: {
      process.stdout.write(usage)
      return 0
    }

    case "today":
    case "add": {
      const date = command === "today" ? todayKey(now) : parseDate(rest[0] ?? "", now)
      const settings = config.load()
      const km = distance(settings, flags.km)
      const note = typeof flags.note === "string" ? flags.note : undefined
      const { entry, changed } = days.set(date, true, { km, rate: settings.rate, source: "manual", note }, now)
      console.log(`${changed ? "Added" : "Already there:"} ${date} (${weekdayName(date)})  ·  ${entry.km} km`)
      return 0
    }

    case "remove": {
      if (!rest[0]) throw new Error("Which day? kmd remove <date>")
      const date = parseDate(rest[0], now)
      const current = days.get(date)
      if (!current?.present) {
        console.log(`Nothing to remove on ${date}.`)
        return 0
      }
      days.set(date, false, { km: current.km, rate: current.rate, source: "manual" }, now)
      console.log(`Removed ${date} (${weekdayName(date)})`)
      return 0
    }

    case "list": {
      const month = parseMonth(rest[0], now)
      process.stdout.write(formatTable(month, days.month(month.year, month.month)))
      return 0
    }

    case "export": {
      const month = parseMonth(rest[0], now)
      const entries = days.month(month.year, month.month)
      const count = entries.filter((entry) => entry.present).length
      const asCsv = flags.csv === true || flags.copy === true || typeof flags.out === "string"
      const text = asCsv ? formatCsv(entries) : formatTable(month, entries)
      if (typeof flags.out === "string") {
        writeFileSync(flags.out, text)
        console.log(`Wrote ${count} days of ${monthLabel(month)} to ${flags.out}`)
      }
      if (flags.copy === true) {
        copyToClipboard(text)
        console.log(`Copied ${count} days of ${monthLabel(month)} to the clipboard (CSV)`)
      }
      if (typeof flags.out !== "string" && flags.copy !== true) process.stdout.write(text)
      return 0
    }

    case "here": {
      const settings = config.load()
      if (flags.list === true) {
        if (settings.networks.length === 0) {
          console.log("No work networks saved yet. At the office, run: kmd here --work [label]")
          return 0
        }
        const fingerprint = currentNetwork()
        const width = Math.max(...settings.networks.map((network) => network.label.length))
        for (const network of settings.networks) {
          const here = matchNetwork(fingerprint, [network]) ? "✓" : " "
          const saved = network.learnedAt ? `  (saved ${network.learnedAt.slice(0, 10)})` : ""
          console.log(`${here} ${network.label.padEnd(width)}  ${describeNetwork(network)}${saved}`)
        }
        return 0
      }
      if (typeof flags.forget === "string" || (flags.forget === true && rest[0])) {
        const label = typeof flags.forget === "string" ? flags.forget : rest[0]
        const kept = settings.networks.filter((network) => network.label !== label)
        if (kept.length === settings.networks.length) throw new Error(`No work network called "${label}".`)
        config.save({ ...settings, networks: kept })
        console.log(`Forgot work network "${label}".`)
        return 0
      }
      const fingerprint = currentNetwork()
      if (!fingerprint) throw new Error("No network: there is no default route right now.")
      console.log(describeNetwork(fingerprint))
      if (flags.work === true) {
        const label = rest[0] ?? "work"
        const network = toKnownNetwork(fingerprint, label, now)
        config.save({ ...settings, networks: [...settings.networks.filter((n) => n.label !== label), network] })
        console.log(`Saved as work network "${label}".`)
        return 0
      }
      const match = matchNetwork(fingerprint, settings.networks)
      console.log(match ? `Known as work network "${match.label}".` : 'Not a known work network. Save it with: kmd here --work [label]')
      return 0
    }

    case "auto": {
      const action = rest[0]
      if (action === "install") {
        console.log(launchd.install(typeof flags.at === "string" ? launchd.parseTimes(flags.at) : launchd.defaultTimes))
        return 0
      }
      if (action === "uninstall") {
        console.log(launchd.uninstall())
        return 0
      }
      if (action === "status") {
        console.log(launchd.status())
        return 0
      }
      if (action !== undefined) throw new Error(`Unknown: kmd auto ${action}`)
      const settings = config.load()
      const today = todayKey(now)
      const decision = shouldMark({ fingerprint: currentNetwork(), config: settings, current: days.get(today), now, force: flags.force === true })
      if (!decision.mark) {
        console.log(`[${stamp(now)}] ${today}: skipped: ${decision.reason}`)
        return 0
      }
      if (settings.km <= 0) {
        console.log(`[${stamp(now)}] ${today}: skipped: distance not set (kmd config km <km>)`)
        return 0
      }
      days.set(today, true, { km: settings.km, rate: settings.rate, source: "auto" }, now)
      console.log(`[${stamp(now)}] ${today}: marked  ·  ${settings.km} km  ·  work network "${decision.network.label}"`)
      return 0
    }

    case "config": {
      const settings = config.load()
      const [key, value] = rest
      if (!key) {
        console.log(describeConfig(settings))
        return 0
      }
      if (value === undefined) throw new Error(`kmd config ${key} <value>`)
      if (key === "km") settings.km = distance(settings, value)
      else if (key === "rate") {
        const rate = Number(value.replace(",", "."))
        if (!Number.isFinite(rate) || rate < 0) throw new Error(`Not a rate: ${value}`)
        settings.rate = rate
      } else if (key === "workdays") {
        const workdays = value.split(",").map((d) => Number(d.trim()))
        if (workdays.length === 0 || workdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new Error("Workdays are ISO weekdays, 1 (Monday) to 7 (Sunday), separated by commas.")
        settings.workdays = [...new Set(workdays)].sort()
      } else if (key === "hours") {
        const [start, end] = value.split("-")
        if (!start || !end || parseClock(start) >= parseClock(end)) throw new Error("Hours look like 08:30-17:00.")
        settings.workHours = { start: start.trim(), end: end.trim() }
      } else throw new Error(`Unknown setting: ${key} (km, rate, workdays, hours)`)
      config.save(settings)
      console.log(describeConfig(settings))
      return 0
    }

    default:
      throw new Error(`Unknown command: ${command}\n\n${usage}`)
  }
}

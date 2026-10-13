import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type Source = "manual" | "auto"

/** One day, as it was last saved. */
export interface DayEntry {
  /** `YYYY-MM-DD` */
  date: string
  present: boolean
  /** Distance for this day, fixed at the moment it was saved. */
  km: number
  /** Rate in €/km, fixed at the moment it was saved. */
  rate: number
  note?: string
  source: Source
  savedAt: string
}

export interface KnownNetwork {
  label: string
  router: string
  routerMac?: string
  dhcpServer?: string
  domain?: string
  learnedAt: string
}

export interface Config {
  /** Default round-trip distance per day. */
  km: number
  /** €/km */
  rate: number
  /** ISO weekdays (1 = Monday … 7 = Sunday) on which `auto` may mark a day. */
  workdays: number[]
  /** `HH:MM` window within which `auto` may mark a day. */
  workHours: { start: string; end: string }
  networks: KnownNetwork[]
}

export const defaultConfig: Config = {
  km: 0,
  rate: 0.23,
  workdays: [1, 2, 3, 4, 5],
  workHours: { start: "08:30", end: "17:00" },
  networks: [],
}

/** `$KMD_DATA`, or `days.jsonl` in the XDG data directory. */
export function defaultDataPath(): string {
  if (process.env.KMD_DATA) return process.env.KMD_DATA
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "kmd", "days.jsonl")
}

/** `$KMD_CONFIG`, or `config.json` in the XDG config directory. */
export function defaultConfigPath(): string {
  if (process.env.KMD_CONFIG) return process.env.KMD_CONFIG
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(configHome, "kmd", "config.json")
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function toEntry(value: unknown): DayEntry | undefined {
  if (!value || typeof value !== "object") return undefined
  const entry = value as Record<string, unknown>
  if (typeof entry.date !== "string" || !datePattern.test(entry.date)) return undefined
  if (typeof entry.present !== "boolean" || typeof entry.savedAt !== "string") return undefined
  if (entry.source !== "manual" && entry.source !== "auto") return undefined
  const km = typeof entry.km === "number" && Number.isFinite(entry.km) ? entry.km : 0
  const rate = typeof entry.rate === "number" && Number.isFinite(entry.rate) ? entry.rate : 0
  return {
    date: entry.date,
    present: entry.present,
    km,
    rate,
    ...(typeof entry.note === "string" && entry.note ? { note: entry.note } : {}),
    source: entry.source,
    savedAt: entry.savedAt,
  }
}

function toNetwork(value: unknown): KnownNetwork | undefined {
  if (!value || typeof value !== "object") return undefined
  const network = value as Record<string, unknown>
  if (typeof network.label !== "string" || typeof network.router !== "string") return undefined
  const optional = (key: string) => (typeof network[key] === "string" && network[key] ? { [key]: network[key] } : {})
  return {
    label: network.label,
    router: network.router,
    ...optional("routerMac"),
    ...optional("dhcpServer"),
    ...optional("domain"),
    learnedAt: typeof network.learnedAt === "string" ? network.learnedAt : "",
  }
}

function writePrivate(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, content, { mode: 0o600 })
  renameSync(temporary, path)
}

/** The settings, as one JSON file. Missing or unreadable keys fall back to the defaults. */
export class ConfigStore {
  constructor(readonly path = defaultConfigPath()) {}

  load(): Config {
    if (!existsSync(this.path)) return structuredClone(defaultConfig)
    let raw: Record<string, unknown>
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8"))
      raw = parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      raw = {}
    }
    const hours = raw.workHours && typeof raw.workHours === "object" ? (raw.workHours as Record<string, unknown>) : {}
    return {
      km: typeof raw.km === "number" && Number.isFinite(raw.km) ? raw.km : defaultConfig.km,
      rate: typeof raw.rate === "number" && Number.isFinite(raw.rate) ? raw.rate : defaultConfig.rate,
      workdays: Array.isArray(raw.workdays) && raw.workdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        ? (raw.workdays as number[])
        : [...defaultConfig.workdays],
      workHours: {
        start: typeof hours.start === "string" ? hours.start : defaultConfig.workHours.start,
        end: typeof hours.end === "string" ? hours.end : defaultConfig.workHours.end,
      },
      networks: Array.isArray(raw.networks) ? raw.networks.map(toNetwork).filter((n): n is KnownNetwork => n !== undefined) : [],
    }
  }

  save(config: Config): void {
    writePrivate(this.path, `${JSON.stringify(config, null, 2)}\n`)
  }
}

export interface SetOptions {
  km: number
  rate: number
  source: Source
  note?: string
}

/** Every change to a day, kept locally as one JSON object per line. The last line for a date wins. */
export class DayStore {
  constructor(readonly path = defaultDataPath()) {}

  /** All saved lines in file order. Unreadable lines are skipped. */
  list(): DayEntry[] {
    if (!existsSync(this.path)) return []
    const entries: DayEntry[] = []
    for (const line of readFileSync(this.path, "utf8").split("\n")) {
      if (!line.trim()) continue
      try {
        const entry = toEntry(JSON.parse(line))
        if (entry) entries.push(entry)
      } catch {
        // A partially written line should not hide the rest of the data.
      }
    }
    return entries
  }

  /** The current state of every date that was ever saved. */
  days(): Map<string, DayEntry> {
    const days = new Map<string, DayEntry>()
    for (const entry of this.list()) days.set(entry.date, entry)
    return days
  }

  get(date: string): DayEntry | undefined {
    return this.days().get(date)
  }

  /** Current state of every saved date in a month (present or not), sorted by date. */
  month(year: number, month: number): DayEntry[] {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`
    return [...this.days().values()].filter((entry) => entry.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Save the state of a day. When nothing would change (same presence, distance
   * and note), the current entry is returned and nothing is written.
   */
  set(date: string, present: boolean, options: SetOptions, now = new Date()): { entry: DayEntry; changed: boolean } {
    if (!datePattern.test(date)) throw new Error(`Not a date: ${date}`)
    const current = this.get(date)
    const note = options.note?.trim() || undefined
    if (current && current.present === present && (!present || (current.km === options.km && current.note === note))) {
      return { entry: current, changed: false }
    }
    const entry: DayEntry = {
      date,
      present,
      km: options.km,
      rate: options.rate,
      ...(note ? { note } : {}),
      source: options.source,
      savedAt: now.toISOString(),
    }
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    return { entry, changed: true }
  }
}

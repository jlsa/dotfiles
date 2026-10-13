import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export interface HistoryEntry {
  id: string
  savedAt: string
  side: "left" | "right"
  text: string
  /** The entry that was loaded on the other side when this one was saved. */
  otherId?: string
}

/** `$DFFR_HISTORY`, or `history.jsonl` in the XDG data directory. */
export function defaultHistoryPath(): string {
  if (process.env.DFFR_HISTORY) return process.env.DFFR_HISTORY
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "dffr", "history.jsonl")
}

function toEntry(value: unknown): HistoryEntry | undefined {
  if (!value || typeof value !== "object") return undefined
  const entry = value as Record<string, unknown>
  if (typeof entry.savedAt !== "string" || (entry.side !== "left" && entry.side !== "right") || typeof entry.text !== "string") return undefined
  return {
    // Entries saved before ids existed are identified by their timestamp.
    id: typeof entry.id === "string" ? entry.id : entry.savedAt,
    savedAt: entry.savedAt,
    side: entry.side,
    text: entry.text,
    ...(typeof entry.otherId === "string" ? { otherId: entry.otherId } : {}),
  }
}

/** Case-insensitive search through the whole text of each entry. */
export function searchHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return entries
  return entries.filter((entry) => entry.text.toLocaleLowerCase().includes(needle))
}

/** Every loaded text, kept locally as one JSON object per line. */
export class HistoryStore {
  constructor(readonly path = defaultHistoryPath()) {}

  /** All entries, newest first. Unreadable lines are skipped. */
  list(): HistoryEntry[] {
    if (!existsSync(this.path)) return []
    const entries: HistoryEntry[] = []
    for (const line of readFileSync(this.path, "utf8").split("\n")) {
      if (!line.trim()) continue
      try {
        const entry = toEntry(JSON.parse(line))
        if (entry) entries.push(entry)
      } catch {
        // A partially written line should not hide the rest of the history.
      }
    }
    return entries.reverse()
  }

  /**
   * Save a text. When it is identical to the most recent entry, that entry is
   * returned instead of saving the text again.
   */
  add(text: string, side: HistoryEntry["side"], otherId?: string, now = new Date()): HistoryEntry {
    const latest = this.list()[0]
    if (latest?.text === text) return latest
    const entry: HistoryEntry = { id: crypto.randomUUID(), savedAt: now.toISOString(), side, text, ...(otherId ? { otherId } : {}) }
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    return entry
  }

  /** The entry this one was compared with: the one it names, or else the newest that names it. */
  counterpart(entry: HistoryEntry): HistoryEntry | undefined {
    const entries = this.list()
    return entries.find((other) => other.id === entry.otherId) ?? entries.find((other) => other.otherId === entry.id)
  }

  remove(id: string): void {
    const kept = this.list().filter((entry) => entry.id !== id).reverse()
    const temporary = `${this.path}.${process.pid}.tmp`
    writeFileSync(temporary, kept.map((entry) => `${JSON.stringify(entry)}\n`).join(""), { mode: 0o600 })
    renameSync(temporary, this.path)
  }
}

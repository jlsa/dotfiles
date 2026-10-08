import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export interface HistoryEntry {
  savedAt: string
  side: "left" | "right"
  text: string
}

/** `$DFFR_HISTORY`, or `history.jsonl` in the XDG data directory. */
export function defaultHistoryPath(): string {
  if (process.env.DFFR_HISTORY) return process.env.DFFR_HISTORY
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "dffr", "history.jsonl")
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return typeof entry.savedAt === "string" && (entry.side === "left" || entry.side === "right") && typeof entry.text === "string"
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
        const value: unknown = JSON.parse(line)
        if (isEntry(value)) entries.push(value)
      } catch {
        // A partially written line should not hide the rest of the history.
      }
    }
    return entries.reverse()
  }

  /** Save a text, unless it is identical to the most recent entry. */
  add(text: string, side: HistoryEntry["side"], now = new Date()): HistoryEntry | undefined {
    if (this.list()[0]?.text === text) return undefined
    const entry: HistoryEntry = { savedAt: now.toISOString(), side, text }
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    return entry
  }
}

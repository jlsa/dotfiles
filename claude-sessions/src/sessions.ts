import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

export interface Session {
  id: string
  title: string
  directory: string
  updated: string
}

const titleTypes = ["custom-title", "ai-title", "summary", "last-prompt"] as const
type TitleType = (typeof titleTypes)[number]

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function promptText(content: unknown): string | undefined {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return undefined
  const part = content.find((item) => item?.type === "text" && typeof item.text === "string")
  return part?.text
}

// Parses one session transcript. Only the few lines that matter are decoded,
// so large transcripts stay cheap to scan.
export function parseSession(id: string, text: string, updated: Date): Session | null {
  let directory: string | undefined
  let firstPrompt: string | undefined
  const titles: Partial<Record<TitleType, string>> = {}

  for (const line of text.split("\n")) {
    const type = /^\{"type":"([a-z-]+)"/.exec(line)?.[1] as TitleType | undefined
    if (type && titleTypes.includes(type)) {
      const entry = JSON.parse(line)
      const value = entry.customTitle ?? entry.aiTitle ?? entry.summary ?? entry.lastPrompt
      if (typeof value === "string" && value.trim()) titles[type] = value
      continue
    }

    if (directory && firstPrompt) continue
    if (!line.includes('"cwd":')) continue
    const entry = JSON.parse(line)
    if (entry.isSidechain) continue
    directory ??= entry.cwd
    if (entry.type === "user" && entry.origin?.kind !== "system") {
      firstPrompt ??= promptText(entry.message?.content)
    }
  }

  if (!directory) return null
  const title = titles["custom-title"] ?? titles["ai-title"] ?? titles.summary ?? firstPrompt ?? titles["last-prompt"]
  return {
    id,
    title: singleLine(title ?? "(untitled)"),
    directory,
    updated: formatDate(updated),
  }
}

export function loadSessions(projectsDir: string): Session[] {
  const found: { session: Session; time: number }[] = []

  for (const project of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue
    const projectDir = join(projectsDir, project.name)

    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) continue
      const path = join(projectDir, file)
      try {
        const stats = statSync(path)
        const session = parseSession(file.slice(0, -".jsonl".length), readFileSync(path, "utf8"), stats.mtime)
        if (session) found.push({ session, time: stats.mtimeMs })
      } catch {
        // Skip unreadable or partially written transcripts.
      }
    }
  }

  return found.sort((a, b) => b.time - a.time).map((item) => item.session)
}

export function filterSessions(sessions: Session[], query: string): Session[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return sessions

  return sessions.filter((session) => {
    const haystack = `${session.title} ${session.directory}`.toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

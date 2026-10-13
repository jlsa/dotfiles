import { describe, expect, test } from "bun:test"
import { filterSessions, parseSession, type Session } from "./sessions"

const sessions: Session[] = [
  { id: "1", title: "Process invoices", directory: "/work/accounting", updated: "2026-09-27 12:00:00" },
  { id: "2", title: "New homepage", directory: "/work/website", updated: "2026-09-26 12:00:00" },
]

const transcript = (...entries: object[]) => entries.map((entry) => JSON.stringify(entry)).join("\n")
const updated = new Date(2026, 8, 27, 12, 0, 0)

describe("parseSession", () => {
  test("prefers a custom title over the AI title and first prompt", () => {
    const text = transcript(
      { type: "user", cwd: "/work/site", message: { role: "user", content: "Fix the\nheader" } },
      { type: "ai-title", aiTitle: "Header fix" },
      { type: "custom-title", customTitle: "My header work" },
    )
    expect(parseSession("abc", text, updated)).toEqual({
      id: "abc",
      title: "My header work",
      directory: "/work/site",
      updated: "2026-09-27 12:00:00",
    })
  })

  test("falls back to the first prompt on a single line", () => {
    const text = transcript({ type: "user", cwd: "/work/site", message: { role: "user", content: "Fix the\nheader" } })
    expect(parseSession("abc", text, updated)?.title).toBe("Fix the header")
  })

  test("ignores transcripts without a working directory", () => {
    expect(parseSession("abc", transcript({ type: "mode", mode: "normal" }), updated)).toBeNull()
  })
})

describe("filterSessions", () => {
  test("searches title and directory case-insensitively", () => {
    expect(filterSessions(sessions, "INVOICES")).toEqual([sessions[0]])
    expect(filterSessions(sessions, "website")).toEqual([sessions[1]])
  })

  test("combines multiple search terms", () => {
    expect(filterSessions(sessions, "homepage work")).toEqual([sessions[1]])
  })
})

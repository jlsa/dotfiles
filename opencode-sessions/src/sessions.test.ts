import { describe, expect, test } from "bun:test"
import { filterSessions, type Session } from "./sessions"

const sessions: Session[] = [
  { id: "1", title: "Process invoices", directory: "/work/accounting", updated: "2026-09-27 12:00:00" },
  { id: "2", title: "New homepage", directory: "/work/website", updated: "2026-09-26 12:00:00" },
]

describe("filterSessions", () => {
  test("searches title and directory case-insensitively", () => {
    expect(filterSessions(sessions, "INVOICES")).toEqual([sessions[0]])
    expect(filterSessions(sessions, "website")).toEqual([sessions[1]])
  })

  test("combines multiple search terms", () => {
    expect(filterSessions(sessions, "homepage work")).toEqual([sessions[1]])
  })
})

import { afterEach, describe, expect, test } from "bun:test"
import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HistoryStore, searchHistory } from "./history"

const directories: string[] = []

function store(): HistoryStore {
  const directory = mkdtempSync(join(tmpdir(), "dffr-history-"))
  directories.push(directory)
  return new HistoryStore(join(directory, "nested", "history.jsonl"))
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("HistoryStore", () => {
  test("is empty before anything is saved", () => {
    expect(store().list()).toEqual([])
  })

  test("saves texts and lists them newest first", () => {
    const history = store()
    const first = history.add("first\nline", "left", undefined, new Date("2026-10-08T10:00:00Z"))
    const second = history.add("second", "right", first.id, new Date("2026-10-08T11:00:00Z"))
    expect(history.list()).toEqual([
      { id: second.id, savedAt: "2026-10-08T11:00:00.000Z", side: "right", text: "second", otherId: first.id },
      { id: first.id, savedAt: "2026-10-08T10:00:00.000Z", side: "left", text: "first\nline" },
    ])
    expect(statSync(history.path).mode & 0o777).toBe(0o600)
  })

  test("returns the latest entry instead of repeating its text", () => {
    const history = store()
    const first = history.add("same", "left")
    expect(history.add("same", "right")).toEqual(first)
    history.add("other", "left")
    history.add("same", "left")
    expect(history.list().map((entry) => entry.text)).toEqual(["same", "other", "same"])
  })

  test("skips lines it cannot read and reads entries saved without an id", () => {
    const history = store()
    history.add("kept", "left")
    appendFileSync(history.path, "{not json\n")
    appendFileSync(history.path, `${JSON.stringify({ savedAt: "2026-10-08T09:00:00.000Z", side: "right", text: "old" })}\n`)
    expect(history.list().map((entry) => [entry.id === "2026-10-08T09:00:00.000Z", entry.text])).toEqual([[true, "old"], [false, "kept"]])
  })

  test("finds the counterpart in either direction", () => {
    const history = store()
    const left = history.add("left text", "left")
    const right = history.add("right text", "right", left.id)
    const alone = history.add("alone", "left")
    expect(history.counterpart(right)?.id).toBe(left.id)
    expect(history.counterpart(left)?.id).toBe(right.id)
    expect(history.counterpart(alone)).toBeUndefined()
  })

  test("removes one entry and keeps the order of the rest", () => {
    const history = store()
    history.add("a", "left")
    const b = history.add("b", "left")
    history.add("c", "left")
    history.remove(b.id)
    expect(history.list().map((entry) => entry.text)).toEqual(["c", "a"])
    expect(statSync(history.path).mode & 0o777).toBe(0o600)
  })

  test("removing from a file that has no valid entries leaves it empty", () => {
    const history = store()
    history.add("only", "left")
    writeFileSync(history.path, "garbage\n")
    history.remove("missing")
    expect(history.list()).toEqual([])
  })
})

describe("searchHistory", () => {
  const entries = [
    { id: "1", savedAt: "", side: "left" as const, text: "first line\nThe Needle is here" },
    { id: "2", savedAt: "", side: "right" as const, text: "nothing" },
  ]

  test("matches anywhere in the text, ignoring case", () => {
    expect(searchHistory(entries, "needle").map((entry) => entry.id)).toEqual(["1"])
  })

  test("returns everything for an empty query", () => {
    expect(searchHistory(entries, "  ")).toHaveLength(2)
  })
})

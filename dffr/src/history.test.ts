import { afterEach, describe, expect, test } from "bun:test"
import { appendFileSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HistoryStore } from "./history"

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
    history.add("first\nline", "left", new Date("2026-10-08T10:00:00Z"))
    history.add("second", "right", new Date("2026-10-08T11:00:00Z"))
    expect(history.list()).toEqual([
      { savedAt: "2026-10-08T11:00:00.000Z", side: "right", text: "second" },
      { savedAt: "2026-10-08T10:00:00.000Z", side: "left", text: "first\nline" },
    ])
    expect(statSync(history.path).mode & 0o777).toBe(0o600)
  })

  test("does not repeat the text that was saved last", () => {
    const history = store()
    expect(history.add("same", "left")).toBeDefined()
    expect(history.add("same", "right")).toBeUndefined()
    history.add("other", "left")
    history.add("same", "left")
    expect(history.list().map((entry) => entry.text)).toEqual(["same", "other", "same"])
  })

  test("skips lines it cannot read", () => {
    const history = store()
    history.add("kept", "left")
    appendFileSync(history.path, "{not json\n")
    expect(history.list().map((entry) => entry.text)).toEqual(["kept"])
  })
})

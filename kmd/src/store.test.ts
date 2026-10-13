import { afterEach, describe, expect, test } from "bun:test"
import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigStore, DayStore, defaultConfig } from "./store"

const directories: string[] = []

function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmd-"))
  directories.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const at = (iso: string) => new Date(iso)
const manual = { km: 42, rate: 0.23, source: "manual" as const }

describe("DayStore", () => {
  test("is empty before anything is saved", () => {
    const store = new DayStore(join(directory(), "nested", "days.jsonl"))
    expect(store.list()).toEqual([])
    expect(store.month(2026, 10)).toEqual([])
  })

  test("saves a day with the distance and rate of that moment", () => {
    const store = new DayStore(join(directory(), "days.jsonl"))
    const { entry, changed } = store.set("2026-10-13", true, { ...manual, note: " klant " }, at("2026-10-13T08:00:00Z"))
    expect(changed).toBe(true)
    expect(entry).toEqual({ date: "2026-10-13", present: true, km: 42, rate: 0.23, note: "klant", source: "manual", savedAt: "2026-10-13T08:00:00.000Z" })
    expect(statSync(store.path).mode & 0o777).toBe(0o600)
  })

  test("the last line for a date wins", () => {
    const store = new DayStore(join(directory(), "days.jsonl"))
    store.set("2026-10-13", true, manual, at("2026-10-13T08:00:00Z"))
    store.set("2026-10-13", true, { ...manual, km: 10 }, at("2026-10-13T09:00:00Z"))
    store.set("2026-10-13", false, manual, at("2026-10-13T10:00:00Z"))
    expect(store.list()).toHaveLength(3)
    expect(store.get("2026-10-13")).toMatchObject({ present: false, savedAt: "2026-10-13T10:00:00.000Z" })
  })

  test("does not write when nothing changes", () => {
    const store = new DayStore(join(directory(), "days.jsonl"))
    const first = store.set("2026-10-13", true, manual, at("2026-10-13T08:00:00Z"))
    const again = store.set("2026-10-13", true, { ...manual, source: "auto" }, at("2026-10-13T09:00:00Z"))
    expect(again.changed).toBe(false)
    expect(again.entry).toEqual(first.entry)
    expect(store.list()).toHaveLength(1)
    store.set("2026-10-13", false, manual)
    expect(store.set("2026-10-13", false, manual).changed).toBe(false)
    expect(store.list()).toHaveLength(2)
  })

  test("lists a month sorted by date, including removed days", () => {
    const store = new DayStore(join(directory(), "days.jsonl"))
    store.set("2026-10-20", true, manual)
    store.set("2026-10-02", true, manual)
    store.set("2026-09-30", true, manual)
    store.set("2026-10-02", false, manual)
    expect(store.month(2026, 10).map((entry) => [entry.date, entry.present])).toEqual([
      ["2026-10-02", false],
      ["2026-10-20", true],
    ])
  })

  test("skips lines it cannot read", () => {
    const store = new DayStore(join(directory(), "days.jsonl"))
    store.set("2026-10-13", true, manual)
    appendFileSync(store.path, "{not json\n")
    appendFileSync(store.path, `${JSON.stringify({ date: "13-10-2026", present: true, source: "manual", savedAt: "" })}\n`)
    appendFileSync(store.path, `${JSON.stringify({ date: "2026-10-14", present: true, source: "elsewhere", savedAt: "" })}\n`)
    expect(store.list().map((entry) => entry.date)).toEqual(["2026-10-13"])
  })

  test("rejects a date that is not YYYY-MM-DD", () => {
    const store = new DayStore(join(directory(), "days.jsonl"))
    expect(() => store.set("13-10", true, manual)).toThrow("Not a date")
  })
})

describe("ConfigStore", () => {
  test("returns the defaults when there is no file", () => {
    const config = new ConfigStore(join(directory(), "config.json"))
    expect(config.load()).toEqual(defaultConfig)
  })

  test("saves and loads settings with mode 0600", () => {
    const config = new ConfigStore(join(directory(), "nested", "config.json"))
    const network = { label: "work", router: "10.0.0.1", routerMac: "aa:bb:cc:dd:ee:ff", domain: "corp.example", learnedAt: "2026-10-13T08:00:00.000Z" }
    config.save({ km: 42, rate: 0.21, workdays: [1, 3], workHours: { start: "09:00", end: "16:00" }, networks: [network] })
    expect(config.load()).toEqual({ km: 42, rate: 0.21, workdays: [1, 3], workHours: { start: "09:00", end: "16:00" }, networks: [network] })
    expect(statSync(config.path).mode & 0o777).toBe(0o600)
  })

  test("falls back per key when the file is incomplete or broken", () => {
    const config = new ConfigStore(join(directory(), "config.json"))
    writeFileSync(config.path, JSON.stringify({ km: "42", workdays: [1, 9], networks: [{ label: "x" }, { label: "ok", router: "1.2.3.4" }] }))
    expect(config.load()).toEqual({ ...defaultConfig, networks: [{ label: "ok", router: "1.2.3.4", learnedAt: "" }] })
    writeFileSync(config.path, "garbage")
    expect(config.load()).toEqual(defaultConfig)
  })
})

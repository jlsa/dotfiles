import { describe, expect, test } from "bun:test"
import { parseClock, shouldMark, withinWorkHours } from "./auto"
import type { NetworkFingerprint } from "./network"
import { defaultConfig, type Config, type DayEntry } from "./store"

const work = { label: "work", router: "10.1.0.1", routerMac: "aa:bb:cc:dd:ee:ff", learnedAt: "" }
const config: Config = { ...defaultConfig, km: 42, networks: [work] }
const atWork: NetworkFingerprint = { interface: "en0", router: "10.1.0.1", routerMac: "aa:bb:cc:dd:ee:ff" }
const atHome: NetworkFingerprint = { interface: "en0", router: "192.168.0.1", routerMac: "b0:19:21:fa:70:f0" }
const tuesday = (hour: number, minute = 0) => new Date(2026, 9, 13, hour, minute)
const saturday = (hour: number) => new Date(2026, 9, 17, hour, 0)
const entry = (present: boolean, source: DayEntry["source"] = "manual"): DayEntry => ({ date: "2026-10-13", present, km: 42, rate: 0.23, source, savedAt: "" })

describe("parseClock", () => {
  test("reads HH:MM", () => {
    expect(parseClock("08:30")).toBe(510)
    expect(parseClock("17:00")).toBe(1020)
    expect(() => parseClock("8h30")).toThrow("Not a time")
    expect(() => parseClock("24:00")).toThrow("Not a time")
  })
})

describe("withinWorkHours", () => {
  test("includes both ends of the window", () => {
    expect(withinWorkHours(config, tuesday(8, 29))).toBe(false)
    expect(withinWorkHours(config, tuesday(8, 30))).toBe(true)
    expect(withinWorkHours(config, tuesday(17, 0))).toBe(true)
    expect(withinWorkHours(config, tuesday(17, 1))).toBe(false)
  })
})

describe("shouldMark", () => {
  test("marks a workday at work during work hours", () => {
    expect(shouldMark({ fingerprint: atWork, config, current: undefined, now: tuesday(10) })).toEqual({ mark: true, network: work })
  })

  test("skips when today is already marked or was removed by hand", () => {
    expect(shouldMark({ fingerprint: atWork, config, current: entry(true, "auto"), now: tuesday(10) })).toEqual({ mark: false, reason: "already marked (auto)" })
    expect(shouldMark({ fingerprint: atWork, config, current: entry(false), now: tuesday(10) })).toEqual({ mark: false, reason: "removed manually" })
    expect(shouldMark({ fingerprint: atWork, config, current: entry(false), now: tuesday(10), force: true })).toEqual({ mark: false, reason: "removed manually" })
  })

  test("skips without a network or on another network", () => {
    expect(shouldMark({ fingerprint: undefined, config, current: undefined, now: tuesday(10) })).toEqual({ mark: false, reason: "no network" })
    expect(shouldMark({ fingerprint: atHome, config, current: undefined, now: tuesday(10) })).toEqual({ mark: false, reason: "not a work network" })
  })

  test("skips outside workdays and work hours, unless forced", () => {
    expect(shouldMark({ fingerprint: atWork, config, current: undefined, now: saturday(10) })).toEqual({ mark: false, reason: "not a workday" })
    expect(shouldMark({ fingerprint: atWork, config, current: undefined, now: tuesday(18, 42) })).toEqual({ mark: false, reason: "outside work hours (18:42)" })
    expect(shouldMark({ fingerprint: atWork, config, current: undefined, now: tuesday(7, 59) })).toEqual({ mark: false, reason: "outside work hours (07:59)" })
    expect(shouldMark({ fingerprint: atWork, config, current: undefined, now: saturday(20), force: true })).toEqual({ mark: true, network: work })
  })
})

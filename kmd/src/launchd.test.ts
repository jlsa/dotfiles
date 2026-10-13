import { describe, expect, test } from "bun:test"
import { defaultTimes, formatTimes, label, logPath, parseTimes, plistPath, renderPlist } from "./launchd"

describe("parseTimes", () => {
  test("reads a comma-separated list, sorted and without duplicates", () => {
    expect(parseTimes("14:00, 10:00,14:00")).toEqual([
      { hour: 10, minute: 0 },
      { hour: 14, minute: 0 },
    ])
    expect(parseTimes("9:15")).toEqual([{ hour: 9, minute: 15 }])
    expect(formatTimes(defaultTimes)).toBe("10:00, 14:00")
  })

  test("rejects invalid times", () => {
    expect(() => parseTimes("10")).toThrow("Not a time")
    expect(() => parseTimes("25:00")).toThrow("Not a time")
    expect(() => parseTimes("10:60")).toThrow("Not a time")
  })
})

describe("renderPlist", () => {
  const plist = renderPlist({ bun: "/opt/homebrew/bin/bun", script: "/Users/joel/Developer/dotfiles/kmd/src/index.ts", times: defaultTimes, log: "/Users/joel/Library/Logs/kmd-auto.log" })

  test("runs kmd auto with bun on an absolute path", () => {
    expect(plist).toContain(`<string>${label}</string>`)
    expect(plist).toContain("<string>/opt/homebrew/bin/bun</string>\n    <string>run</string>\n    <string>/Users/joel/Developer/dotfiles/kmd/src/index.ts</string>\n    <string>auto</string>")
  })

  test("puts bun and the system tools on the PATH", () => {
    expect(plist).toContain("<string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>")
  })

  test("schedules one calendar interval per time and no RunAtLoad", () => {
    expect(plist.match(/<key>Hour<\/key>/g)).toHaveLength(2)
    expect(plist).toContain("<key>Hour</key>\n      <integer>10</integer>\n      <key>Minute</key>\n      <integer>0</integer>")
    expect(plist).toContain("<key>Hour</key>\n      <integer>14</integer>")
    expect(plist).not.toContain("RunAtLoad")
    expect(plist).not.toContain("StartInterval")
  })

  test("logs to the given file", () => {
    expect(plist.match(/<string>\/Users\/joel\/Library\/Logs\/kmd-auto.log<\/string>/g)).toHaveLength(2)
  })

  test("escapes XML in paths", () => {
    expect(renderPlist({ bun: "/a&b/bun", script: "/x/index.ts", times: defaultTimes, log: "/l" })).toContain("<string>/a&amp;b/bun</string>")
  })
})

describe("paths", () => {
  test("live under the home directory", () => {
    expect(plistPath("/Users/joel")).toBe(`/Users/joel/Library/LaunchAgents/${label}.plist`)
    expect(logPath("/Users/joel")).toBe("/Users/joel/Library/Logs/kmd-auto.log")
  })
})

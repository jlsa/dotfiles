import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export const label = "nl.joel.kmd.auto"

export interface ClockTime {
  hour: number
  minute: number
}

export const defaultTimes: ClockTime[] = [
  { hour: 10, minute: 0 },
  { hour: 14, minute: 0 },
]

export function plistPath(home = homedir()): string {
  return join(home, "Library", "LaunchAgents", `${label}.plist`)
}

export function logPath(home = homedir()): string {
  return join(home, "Library", "Logs", "kmd-auto.log")
}

/** `10:00,14:00` → times, sorted and without duplicates. */
export function parseTimes(text: string): ClockTime[] {
  const times: ClockTime[] = []
  for (const part of text.split(",")) {
    const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(part)
    if (!match) throw new Error(`Not a time: ${part.trim()} (use HH:MM, separated by commas)`)
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour > 23 || minute > 59) throw new Error(`Not a time: ${part.trim()}`)
    if (!times.some((t) => t.hour === hour && t.minute === minute)) times.push({ hour, minute })
  }
  if (times.length === 0) throw new Error("Give at least one time.")
  return times.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
}

export function formatTimes(times: ClockTime[]): string {
  return times.map((t) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`).join(", ")
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** The LaunchAgent that runs `kmd auto` at fixed times. */
export function renderPlist(options: { bun: string; script: string; times: ClockTime[]; log: string }): string {
  const path = [dirname(options.bun), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].filter((p, i, all) => all.indexOf(p) === i).join(":")
  const intervals = options.times
    .map(
      (t) => `    <dict>
      <key>Hour</key>
      <integer>${t.hour}</integer>
      <key>Minute</key>
      <integer>${t.minute}</integer>
    </dict>`,
    )
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(options.bun)}</string>
    <string>run</string>
    <string>${escapeXml(options.script)}</string>
    <string>auto</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(path)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
${intervals}
  </array>
  <key>StandardOutPath</key>
  <string>${escapeXml(options.log)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.log)}</string>
</dict>
</plist>
`
}

function launchctl(...args: string[]): { ok: boolean; output: string } {
  const result = Bun.spawnSync(["launchctl", ...args], { stdout: "pipe", stderr: "pipe" })
  return { ok: result.exitCode === 0, output: `${result.stdout.toString()}${result.stderr.toString()}`.trim() }
}

function domain(): string {
  return `gui/${process.getuid?.() ?? 501}`
}

/** Write the plist and load it. Returns a line describing what was installed. */
export function install(times: ClockTime[]): string {
  const path = plistPath()
  const log = logPath()
  mkdirSync(dirname(path), { recursive: true })
  mkdirSync(dirname(log), { recursive: true })
  // A job that is already loaded must be unloaded before the new plist can be bootstrapped.
  launchctl("bootout", `${domain()}/${label}`)
  writeFileSync(path, renderPlist({ bun: process.execPath, script: join(import.meta.dir, "index.ts"), times, log }))
  const loaded = launchctl("bootstrap", domain(), path)
  if (!loaded.ok) throw new Error(`launchctl bootstrap failed: ${loaded.output}`)
  return `Installed ${path}\nRuns kmd auto at ${formatTimes(times)} (missed times run at the next wake). Log: ${log}`
}

export function uninstall(): string {
  const path = plistPath()
  launchctl("bootout", `${domain()}/${label}`)
  if (!existsSync(path)) return "No LaunchAgent installed."
  unlinkSync(path)
  return `Removed ${path}`
}

export function status(): string {
  const path = plistPath()
  if (!existsSync(path)) return "Not installed. Run: kmd auto install"
  const printed = launchctl("print", `${domain()}/${label}`)
  if (!printed.ok) return `Plist exists at ${path} but the job is not loaded. Run: kmd auto install`
  const lastExit = /last exit code = ([^\n]+)/.exec(printed.output)?.[1]?.trim()
  const lines = [`Loaded: ${path}`]
  if (lastExit) lines.push(`Last exit code: ${lastExit}`)
  lines.push(`Log: ${logPath()}`)
  lines.push("Run now: launchctl kickstart " + `${domain()}/${label}`)
  return lines.join("\n")
}

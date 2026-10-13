import { isoWeekday, todayKey } from "./month"
import { matchNetwork, type NetworkFingerprint } from "./network"
import type { Config, DayEntry, KnownNetwork } from "./store"

export type AutoDecision = { mark: true; network: KnownNetwork } | { mark: false; reason: string }

/** `HH:MM` → minutes since midnight. */
export function parseClock(text: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!match) throw new Error(`Not a time: ${text} (use HH:MM)`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error(`Not a time: ${text}`)
  return hour * 60 + minute
}

function clock(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
}

export function withinWorkHours(config: Config, now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= parseClock(config.workHours.start) && minutes <= parseClock(config.workHours.end)
}

/**
 * Whether `auto` should mark today. The checks are ordered so the reason
 * printed in the log is the most useful one.
 */
export function shouldMark(options: {
  fingerprint: NetworkFingerprint | undefined
  config: Config
  current: DayEntry | undefined
  now: Date
  force?: boolean
}): AutoDecision {
  const { fingerprint, config, current, now, force = false } = options
  if (current?.present) return { mark: false, reason: `already marked (${current.source})` }
  if (current && !current.present) return { mark: false, reason: "removed manually" }
  if (!fingerprint) return { mark: false, reason: "no network" }
  const network = matchNetwork(fingerprint, config.networks)
  if (!network) return { mark: false, reason: "not a work network" }
  if (!force) {
    const weekday = isoWeekday(todayKey(now))
    if (!config.workdays.includes(weekday)) return { mark: false, reason: "not a workday" }
    if (!withinWorkHours(config, now)) return { mark: false, reason: `outside work hours (${clock(now)})` }
  }
  return { mark: true, network }
}

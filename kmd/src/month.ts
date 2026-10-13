import type { DayEntry } from "./store"

export interface Month {
  year: number
  /** 1 … 12 */
  month: number
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const pad = (n: number, width = 2) => String(n).padStart(width, "0")

export function currentMonth(today = new Date()): Month {
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

export function monthKey({ year, month }: Month): string {
  return `${year}-${pad(month)}`
}

export function monthLabel({ year, month }: Month): string {
  return `${monthNames[month - 1]} ${year}`
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function daysInMonth({ year, month }: Month): number {
  return new Date(year, month, 0).getDate()
}

/** `YYYY-MM`, `-N` (N months ago) or nothing (this month). */
export function parseMonth(arg: string | undefined, today = new Date()): Month {
  if (arg === undefined || arg === "") return currentMonth(today)
  const back = /^-(\d{1,3})$/.exec(arg)
  if (back) return shiftMonth(currentMonth(today), -Number(back[1]))
  const full = /^(\d{4})-(\d{1,2})$/.exec(arg)
  if (full) {
    const month = Number(full[2])
    if (month >= 1 && month <= 12) return { year: Number(full[1]), month }
  }
  throw new Error(`Not a month: ${arg} (use YYYY-MM, or -1 for last month)`)
}

export function isMonthArgument(arg: string | undefined): boolean {
  return arg !== undefined && (/^-\d{1,3}$/.test(arg) || /^\d{4}-\d{1,2}$/.test(arg))
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function todayKey(today = new Date()): string {
  return dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate())
}

function isValidDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth({ year, month })
}

/** `today`, `13` (this month), `13-10` (this year) or `2026-10-13`. */
export function parseDate(arg: string, today = new Date()): string {
  if (arg === "today") return todayKey(today)
  let year = today.getFullYear()
  let month = today.getMonth() + 1
  let day: number
  const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(arg)
  const dayMonth = /^(\d{1,2})-(\d{1,2})$/.exec(arg)
  const dayOnly = /^(\d{1,2})$/.exec(arg)
  if (full) {
    year = Number(full[1])
    month = Number(full[2])
    day = Number(full[3])
  } else if (dayMonth) {
    day = Number(dayMonth[1])
    month = Number(dayMonth[2])
  } else if (dayOnly) {
    day = Number(dayOnly[1])
  } else {
    throw new Error(`Not a date: ${arg} (use YYYY-MM-DD, DD-MM, DD or today)`)
  }
  if (!isValidDate(year, month, day)) throw new Error(`Not a date: ${arg}`)
  return dateKey(year, month, day)
}

function toDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/** `Mon` … `Sun` */
export function weekdayName(key: string): string {
  return weekdayNames[toDate(key).getDay()]
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(key: string): number {
  return toDate(key).getDay() || 7
}

export function isWeekend(key: string): boolean {
  return isoWeekday(key) >= 6
}

/** `13 Oct` */
export function shortDate(key: string): string {
  const date = toDate(key)
  return `${date.getDate()} ${monthNames[date.getMonth()].slice(0, 3)}`
}

export interface MonthSummary {
  days: number
  km: number
  amount: number
}

export function amountOf(entry: DayEntry): number {
  return Math.round(entry.km * entry.rate * 100) / 100
}

/** Totals over the days that were present. */
export function monthSummary(entries: DayEntry[]): MonthSummary {
  const present = entries.filter((entry) => entry.present)
  const km = present.reduce((sum, entry) => sum + entry.km, 0)
  const amount = present.reduce((sum, entry) => sum + amountOf(entry), 0)
  return { days: present.length, km, amount: Math.round(amount * 100) / 100 }
}

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" })

/** `€ 115,92` */
export function formatAmount(amount: number): string {
  return euro.format(amount).replace(/ /g, " ")
}

function formatKm(km: number): string {
  return Number.isInteger(km) ? String(km) : String(km).replace(".", ",")
}

/** `115,92` (Dutch decimal separator, for spreadsheets). */
function csvNumber(value: number): string {
  return value.toFixed(2).replace(".", ",")
}

/** `October 2026  ·  12 days  ·  504 km  ·  € 115,92` */
export function summaryLine(month: Month, entries: DayEntry[]): string {
  const summary = monthSummary(entries)
  return `${monthLabel(month)}  ·  ${summary.days} ${summary.days === 1 ? "day" : "days"}  ·  ${formatKm(summary.km)} km  ·  ${formatAmount(summary.amount)}`
}

/** A table of the present days with a total line. */
export function formatTable(month: Month, entries: DayEntry[]): string {
  const present = entries.filter((entry) => entry.present)
  if (present.length === 0) return `No days in ${monthLabel(month)}.\n`
  const rows = present.map((entry) => [entry.date, weekdayName(entry.date), formatKm(entry.km), formatAmount(amountOf(entry)), entry.source, entry.note ?? ""])
  const summary = monthSummary(present)
  rows.push(["Total", `${summary.days} ${summary.days === 1 ? "day" : "days"}`, formatKm(summary.km), formatAmount(summary.amount), "", ""])
  const header = ["Date", "Day", "km", "Amount", "Source", "Note"]
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)))
  const right = new Set([2, 3])
  const line = (cells: string[]) => cells.map((cell, i) => (right.has(i) ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join("  ").trimEnd()
  const out = [monthLabel(month), "", line(header), widths.map((w) => "-".repeat(w)).join("  ")]
  for (const row of rows.slice(0, -1)) out.push(line(row))
  out.push(widths.map((w) => "-".repeat(w)).join("  "))
  out.push(line(rows[rows.length - 1]))
  return `${out.join("\n")}\n`
}

/** `date;weekday;km;amount;source;note`, one line per present day, `;`-separated with `,` as decimal separator. */
export function formatCsv(entries: DayEntry[]): string {
  const quote = (text: string) => (/[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
  const lines = ["date;weekday;km;amount;source;note"]
  for (const entry of entries.filter((e) => e.present)) {
    lines.push([entry.date, weekdayName(entry.date), csvNumber(entry.km), csvNumber(amountOf(entry)), entry.source, quote(entry.note ?? "")].join(";"))
  }
  return `${lines.join("\n")}\n`
}

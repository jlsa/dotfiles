import { describe, expect, test } from "bun:test"
import {
  daysInMonth,
  formatAmount,
  formatCsv,
  formatTable,
  isMonthArgument,
  isoWeekday,
  monthSummary,
  parseDate,
  parseMonth,
  shiftMonth,
  summaryLine,
  weekdayName,
} from "./month"
import type { DayEntry } from "./store"

const today = new Date(2026, 9, 13, 12, 0, 0) // Tuesday 13 October 2026

const day = (date: string, km: number, extra: Partial<DayEntry> = {}): DayEntry => ({
  date,
  present: true,
  km,
  rate: 0.23,
  source: "manual",
  savedAt: "2026-10-13T08:00:00.000Z",
  ...extra,
})

describe("parseMonth", () => {
  test("defaults to this month", () => {
    expect(parseMonth(undefined, today)).toEqual({ year: 2026, month: 10 })
    expect(parseMonth("", today)).toEqual({ year: 2026, month: 10 })
  })

  test("reads YYYY-MM and -N", () => {
    expect(parseMonth("2026-09", today)).toEqual({ year: 2026, month: 9 })
    expect(parseMonth("2025-1", today)).toEqual({ year: 2025, month: 1 })
    expect(parseMonth("-1", today)).toEqual({ year: 2026, month: 9 })
    expect(parseMonth("-10", today)).toEqual({ year: 2025, month: 12 })
  })

  test("rejects other input", () => {
    expect(() => parseMonth("2026-13", today)).toThrow("Not a month")
    expect(() => parseMonth("october", today)).toThrow("Not a month")
  })

  test("isMonthArgument tells month arguments from commands", () => {
    expect(isMonthArgument("2026-09")).toBe(true)
    expect(isMonthArgument("-1")).toBe(true)
    expect(isMonthArgument("today")).toBe(false)
    expect(isMonthArgument(undefined)).toBe(false)
  })
})

describe("shiftMonth and daysInMonth", () => {
  test("crosses year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 10 }, -24)).toEqual({ year: 2024, month: 10 })
  })

  test("knows leap years", () => {
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29)
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28)
    expect(daysInMonth({ year: 2026, month: 10 })).toBe(31)
  })
})

describe("parseDate", () => {
  test("reads today, a day, a day and month, or a full date", () => {
    expect(parseDate("today", today)).toBe("2026-10-13")
    expect(parseDate("2", today)).toBe("2026-10-02")
    expect(parseDate("15-9", today)).toBe("2026-09-15")
    expect(parseDate("2025-12-31", today)).toBe("2025-12-31")
  })

  test("rejects dates that do not exist", () => {
    expect(() => parseDate("32", today)).toThrow("Not a date")
    expect(() => parseDate("31-9", today)).toThrow("Not a date")
    expect(() => parseDate("2026-02-29", today)).toThrow("Not a date")
    expect(() => parseDate("monday", today)).toThrow("Not a date")
  })
})

describe("weekdays", () => {
  test("names and ISO numbers", () => {
    expect(weekdayName("2026-10-13")).toBe("Tue")
    expect(isoWeekday("2026-10-12")).toBe(1)
    expect(isoWeekday("2026-10-18")).toBe(7)
  })
})

describe("monthSummary", () => {
  test("adds up the present days with their own km and rate", () => {
    const entries = [day("2026-10-01", 42), day("2026-10-02", 10, { rate: 0.21 }), day("2026-10-03", 42, { present: false })]
    expect(monthSummary(entries)).toEqual({ days: 2, km: 52, amount: 11.76 })
    expect(summaryLine({ year: 2026, month: 10 }, entries)).toBe("October 2026  ·  2 days  ·  52 km  ·  € 11,76")
  })

  test("formats euros the Dutch way", () => {
    expect(formatAmount(115.92)).toBe("€ 115,92")
    expect(formatAmount(0)).toBe("€ 0,00")
  })
})

describe("formatTable", () => {
  test("lists the present days and a total", () => {
    const text = formatTable({ year: 2026, month: 10 }, [day("2026-10-01", 42, { source: "auto" }), day("2026-10-02", 10, { note: "klant" }), day("2026-10-03", 42, { present: false })])
    expect(text).toBe(
      [
        "October 2026",
        "",
        "Date        Day     km   Amount  Source  Note",
        "----------  ------  --  -------  ------  -----",
        "2026-10-01  Thu     42   € 9,66  auto",
        "2026-10-02  Fri     10   € 2,30  manual  klant",
        "----------  ------  --  -------  ------  -----",
        "Total       2 days  52  € 11,96",
        "",
      ].join("\n"),
    )
  })

  test("says when a month is empty", () => {
    expect(formatTable({ year: 2026, month: 9 }, [])).toBe("No days in September 2026.\n")
  })
})

describe("formatCsv", () => {
  test("writes semicolon-separated rows with Dutch decimals", () => {
    expect(formatCsv([day("2026-10-01", 42), day("2026-10-02", 12.5, { note: 'klant; "A"' }), day("2026-10-03", 42, { present: false })])).toBe(
      ["date;weekday;km;amount;source;note", "2026-10-01;Thu;42,00;9,66;manual;", '2026-10-02;Fri;12,50;2,88;manual;"klant; ""A"""', ""].join("\n"),
    )
  })
})

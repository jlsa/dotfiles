import {
  BoxRenderable,
  InputRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type SelectOption,
} from "@opentui/core"
import { writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { dateKey, daysInMonth, formatCsv, isWeekend, monthKey, monthLabel, parseMonth, shiftMonth, shortDate, summaryLine, todayKey, weekdayName, type Month } from "./month"
import { ConfigStore, DayStore, type DayEntry } from "./store"

const colors = {
  background: "#101418",
  accent: "#86efac",
  selected: "#14532d",
  text: "#cbd5e1",
  muted: "#64748b",
  border: "#334155",
  error: "#fca5a5",
}

const defaultFooter = "Space toggle  ·  k km  ·  ←/→ month  ·  m go to  ·  t today  ·  c copy CSV  ·  s save CSV  ·  q quit"

export async function runTui(initialMonth: Month): Promise<void> {
  const configStore = new ConfigStore()
  const days = new DayStore()
  let month = initialMonth
  let mode: "days" | "km" | "month" = "days"
  let entries = new Map<string, DayEntry>()

  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: true,
    targetFps: 30,
  })

  const root = new BoxRenderable(renderer, {
    id: "app",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    backgroundColor: colors.background,
  })
  const title = new TextRenderable(renderer, { id: "title", content: "", fg: colors.accent })
  const inputBox = new BoxRenderable(renderer, {
    id: "input-box",
    borderStyle: "rounded",
    borderColor: colors.border,
    height: 3,
    width: "100%",
    marginTop: 1,
    paddingLeft: 1,
    paddingRight: 1,
    visible: false,
  })
  const inputLabel = new TextRenderable(renderer, { id: "input-label", content: "", fg: colors.muted, width: 24 })
  const input = new InputRenderable(renderer, {
    id: "input",
    width: "100%",
    textColor: "#e2e8f0",
    cursorColor: colors.accent,
  })
  const list = new SelectRenderable(renderer, {
    id: "days",
    width: "100%",
    flexGrow: 1,
    marginTop: 1,
    showDescription: false,
    showScrollIndicator: true,
    wrapSelection: true,
    backgroundColor: colors.background,
    focusedBackgroundColor: colors.background,
    selectedBackgroundColor: colors.selected,
    selectedTextColor: "#f8fafc",
    textColor: colors.text,
  })
  const footer = new TextRenderable(renderer, { id: "footer", content: defaultFooter, fg: colors.muted, height: 1, marginTop: 1 })

  inputBox.flexDirection = "row"
  inputBox.add(inputLabel)
  inputBox.add(input)
  root.add(title)
  root.add(inputBox)
  root.add(list)
  root.add(footer)
  renderer.root.add(root)

  function say(message: string, isError = false): void {
    footer.content = message
    footer.fg = isError ? colors.error : colors.muted
  }

  function selectedDate(): string {
    return dateKey(month.year, month.month, list.getSelectedIndex() + 1)
  }

  function timeOf(entry: DayEntry): string {
    const saved = new Date(entry.savedAt)
    return Number.isNaN(saved.getTime()) ? "" : ` ${String(saved.getHours()).padStart(2, "0")}:${String(saved.getMinutes()).padStart(2, "0")}`
  }

  function dayOptions(): SelectOption[] {
    const today = todayKey()
    const options: SelectOption[] = []
    for (let day = 1; day <= daysInMonth(month); day++) {
      const date = dateKey(month.year, month.month, day)
      const entry = entries.get(date)
      const label = `${weekdayName(date)} ${shortDate(date).padEnd(7)}${date === today ? "▸" : " "}`
      let detail: string
      if (entry?.present) {
        detail = `✓  ${String(entry.km).padStart(4)} km   ${entry.source}${timeOf(entry)}${entry.note ? `  ·  ${entry.note}` : ""}`
      } else {
        detail = isWeekend(date) ? "   weekend" : ""
      }
      options.push({ name: `${label}  ${detail}`.trimEnd(), description: "", value: date })
    }
    return options
  }

  /** Reload the month, keeping the selection on the same day where possible. */
  function refresh(selectDay?: number): void {
    const keep = selectDay ?? list.getSelectedIndex() + 1
    entries = new Map(days.month(month.year, month.month).map((entry) => [entry.date, entry]))
    title.content = ` ${summaryLine(month, [...entries.values()])} `
    list.options = dayOptions()
    list.setSelectedIndex(Math.min(Math.max(keep, 1), daysInMonth(month)) - 1)
  }

  function showMonth(next: Month, selectDay?: number): void {
    month = next
    const today = new Date()
    const day = selectDay ?? (monthKey(next) === monthKey({ year: today.getFullYear(), month: today.getMonth() + 1 }) ? today.getDate() : 1)
    refresh(day)
  }

  function toggle(date: string): void {
    const current = entries.get(date)
    if (current?.present) {
      days.set(date, false, { km: current.km, rate: current.rate, source: "manual" })
      say(`Removed ${date}`)
    } else {
      const config = configStore.load()
      if (config.km <= 0) {
        say("Set a distance first: kmd config km <km>  (or press k to set it for this day)", true)
        return
      }
      days.set(date, true, { km: config.km, rate: config.rate, source: "manual", note: current?.note })
      say(`Added ${date}  ·  ${config.km} km`)
    }
    refresh()
  }

  function openInput(next: "km" | "month", label: string, value: string): void {
    mode = next
    inputLabel.content = label
    input.value = value
    inputBox.visible = true
    say(next === "km" ? "Enter save  ·  Esc cancel" : "YYYY-MM, or -1 for last month  ·  Enter go  ·  Esc cancel")
    input.focus()
  }

  function closeInput(): void {
    mode = "days"
    inputBox.visible = false
    input.value = ""
    list.focus()
  }

  function commitInput(): void {
    const value = input.value.trim()
    if (mode === "km") {
      const date = selectedDate()
      const km = Number(value.replace(",", "."))
      if (!Number.isFinite(km) || km <= 0) throw new Error(`Not a distance: ${value}`)
      const current = entries.get(date)
      const config = configStore.load()
      days.set(date, true, { km, rate: current?.present ? current.rate : config.rate, source: current?.present ? current.source : "manual", note: current?.note })
      closeInput()
      refresh()
      say(`${date}  ·  ${km} km`)
    } else if (mode === "month") {
      const next = parseMonth(value)
      closeInput()
      showMonth(next)
      say(defaultFooter)
    }
  }

  function csvFile(): string {
    return join(homedir(), "Downloads", `kmd-${monthKey(month)}.csv`)
  }

  function presentCount(): number {
    return [...entries.values()].filter((entry) => entry.present).length
  }

  function copyCsv(): void {
    const result = Bun.spawnSync(["pbcopy"], { stdin: Buffer.from(formatCsv([...entries.values()])) })
    if (result.exitCode !== 0) throw new Error("Could not write to the clipboard.")
    say(`Copied ${presentCount()} days of ${monthLabel(month)} to the clipboard (CSV)`)
  }

  function saveCsv(): void {
    writeFileSync(csvFile(), formatCsv([...entries.values()]))
    say(`Saved ${presentCount()} days of ${monthLabel(month)} to ${csvFile()}`)
  }

  function handleKey(name: string): void {
    if (mode !== "days") {
      if (name === "return") commitInput()
      if (name === "escape") {
        closeInput()
        say(defaultFooter)
      }
      return
    }
    if (name === "space") toggle(selectedDate())
    if (name === "k") {
      const current = entries.get(selectedDate())
      const known = current?.present ? current.km : configStore.load().km
      openInput("km", `km for ${shortDate(selectedDate())}${known ? ` (${known})` : ""}`, "")
    }
    if (name === "m") openInput("month", `Month (${monthKey(month)})`, "")
    if (name === "left" || name === "[") showMonth(shiftMonth(month, -1))
    if (name === "right" || name === "]") showMonth(shiftMonth(month, 1))
    if (name === "t") {
      const today = new Date()
      showMonth({ year: today.getFullYear(), month: today.getMonth() + 1 }, today.getDate())
    }
    if (name === "c") copyCsv()
    if (name === "s") saveCsv()
    if (name === "q" || name === "escape") renderer.destroy()
  }

  list.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
    if (mode !== "days") return
    try {
      toggle(option.value as string)
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    }
  })

  renderer.keyInput.on("keypress", (key) => {
    const name = key.name === "" ? key.sequence : key.name
    // The key that opens an input should not also be typed into it, and the
    // Enter or Esc that closes it should not also reach the list.
    if (mode === "days" && (name === "k" || name === "m")) key.preventDefault()
    if (mode !== "days" && (name === "return" || name === "escape")) key.preventDefault()
    try {
      handleKey(name)
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    }
  })

  showMonth(month)
  list.focus()
}

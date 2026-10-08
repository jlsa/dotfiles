import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type SelectOption,
} from "@opentui/core"
import { HistoryStore, searchHistory, type HistoryEntry } from "./history"
import type { FileDiff, LoadedDiff } from "./model"
import { formatFile } from "./parse-unified"
import { renderComparison } from "./render-compare"
import { ClipboardSource, loadText } from "./sources"
import { comparePlainText } from "./text-compare"

let left: LoadedDiff | undefined
let right: LoadedDiff | undefined
let selectedPath: string | undefined
type Side = "left" | "right"

let mode: "files" | "history" | "search" = "files"
let historyEntries: HistoryEntry[] = []
let historyQuery = ""
let pendingDeleteId: string | undefined
const history = new HistoryStore()

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
  backgroundColor: "#0b1017",
})
const title = new TextRenderable(renderer, {
  id: "title",
  content: " dffr  ·  Compare two unified diffs",
  fg: "#7dd3fc",
})
const summary = new TextRenderable(renderer, {
  id: "summary",
  content: "Load a diff from your clipboard into each side to begin.",
  fg: "#94a3b8",
  marginBottom: 1,
})
const content = new BoxRenderable(renderer, {
  id: "content",
  flexDirection: "row",
  width: "100%",
  flexGrow: 1,
})
const filePanel = new BoxRenderable(renderer, {
  id: "files-panel",
  flexDirection: "column",
  width: "28%",
  borderStyle: "rounded",
  borderColor: "#334155",
  padding: 1,
})
const fileTitle = new TextRenderable(renderer, { id: "files-title", content: "FILES", fg: "#94a3b8" })
const search = new InputRenderable(renderer, {
  id: "history-search",
  width: "100%",
  marginTop: 1,
  placeholder: "Search history…",
  backgroundColor: "#111a26",
  focusedBackgroundColor: "#173452",
  textColor: "#f8fafc",
  focusedTextColor: "#f8fafc",
  placeholderColor: "#64748b",
  visible: false,
})
const files = new SelectRenderable(renderer, {
  id: "files",
  width: "100%",
  flexGrow: 1,
  marginTop: 1,
  showDescription: true,
  showScrollIndicator: true,
  wrapSelection: true,
  backgroundColor: "#0b1017",
  focusedBackgroundColor: "#0b1017",
  selectedBackgroundColor: "#173452",
  selectedTextColor: "#f8fafc",
  textColor: "#cbd5e1",
  descriptionColor: "#64748b",
  selectedDescriptionColor: "#bae6fd",
})
const leftPanel = new BoxRenderable(renderer, {
  id: "left-panel",
  flexDirection: "column",
  width: "36%",
  marginLeft: 1,
  borderStyle: "rounded",
  borderColor: "#334155",
  padding: 1,
})
const rightPanel = new BoxRenderable(renderer, {
  id: "right-panel",
  flexDirection: "column",
  width: "36%",
  marginLeft: 1,
  borderStyle: "rounded",
  borderColor: "#334155",
  padding: 1,
})
const leftTitle = new TextRenderable(renderer, { id: "left-title", content: "LEFT · Empty", fg: "#fbbf24" })
const rightTitle = new TextRenderable(renderer, { id: "right-title", content: "RIGHT · Empty", fg: "#a78bfa" })
const leftDiff = new TextRenderable(renderer, { id: "left-diff", content: "Press l to load the clipboard.", fg: "#cbd5e1", marginTop: 1 })
const rightDiff = new TextRenderable(renderer, { id: "right-diff", content: "Press r to load the clipboard.", fg: "#cbd5e1", marginTop: 1 })
const footer = new TextRenderable(renderer, {
  id: "footer",
  content: "l load left  ·  r load right  ·  ↑/↓ choose file  ·  q quit",
  fg: "#64748b",
  height: 1,
  marginTop: 1,
})

filePanel.add(fileTitle)
filePanel.add(search)
filePanel.add(files)
leftPanel.add(leftTitle)
leftPanel.add(leftDiff)
rightPanel.add(rightTitle)
rightPanel.add(rightDiff)
content.add(filePanel)
content.add(leftPanel)
content.add(rightPanel)
root.add(title)
root.add(summary)
root.add(content)
root.add(footer)
renderer.root.add(root)

function fileAt(diff: LoadedDiff | undefined, path: string | undefined): FileDiff | undefined {
  return diff?.files.find((file) => file.path === path)
}

function allPaths(): string[] {
  return [...new Set([...(left?.files ?? []), ...(right?.files ?? [])].map((file) => file.path))].sort((a, b) => a.localeCompare(b))
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function historyOptions(): SelectOption[] {
  if (historyEntries.length === 0) {
    return historyQuery
      ? [{ name: "No matches", description: `Nothing in the history contains “${historyQuery}”`, value: null }]
      : [{ name: "No history yet", description: "Texts you load are saved here", value: null }]
  }
  return historyEntries.map((entry, index) => {
    const firstLine = entry.text.split("\n").find((line) => line.trim())?.trim() ?? "(blank)"
    const lineCount = entry.text.replace(/\n$/, "").split("\n").length
    return {
      name: firstLine,
      description: `${formatTime(entry.savedAt)} · ${entry.side} · ${lineCount} line${lineCount === 1 ? "" : "s"}`,
      value: index,
    }
  })
}

function fileOptions(): SelectOption[] {
  const paths = allPaths()
  if (paths.length === 0) return [{ name: "No diffs loaded", description: "Press l or r to load your clipboard", value: null }]
  return paths.map((path) => {
    const locations = [fileAt(left, path) ? "L" : "", fileAt(right, path) ? "R" : ""].filter(Boolean).join(" · ")
    return { name: path, description: `Present in: ${locations}`, value: path }
  })
}

function sideTitle(label: "LEFT" | "RIGHT", diff: LoadedDiff | undefined): string {
  return diff ? `${label} · ${diff.files.length} file${diff.files.length === 1 ? "" : "s"} · ${diff.source}` : `${label} · Empty`
}

/** Width available for text inside a panel: minus its border and padding. */
function innerWidth(panel: BoxRenderable): number {
  return panel.width - 4
}

function renderSelectedFile(): void {
  if (left?.kind === "plain-text" && right?.kind === "plain-text" && left.text !== undefined && right.text !== undefined) {
    const rows = comparePlainText(left.text, right.text)
    const rendered = renderComparison(rows, { left: innerWidth(leftPanel), right: innerWidth(rightPanel) })
    // The comparison wraps long lines itself to keep both panes aligned.
    leftDiff.wrapMode = "none"
    rightDiff.wrapMode = "none"
    leftDiff.content = rendered.left
    rightDiff.content = rendered.right
    return
  }
  leftDiff.wrapMode = "word"
  rightDiff.wrapMode = "word"
  leftDiff.content = left ? formatFile(fileAt(left, selectedPath)) : "Press l to load the clipboard."
  rightDiff.content = right ? formatFile(fileAt(right, selectedPath)) : "Press r to load the clipboard."
}

const historyFooter = "Enter open both sides  ·  l/r load into left/right  ·  / search  ·  d delete  ·  s swap  ·  h/Esc back"

function showFileList(): void {
  const paths = allPaths()
  search.visible = false
  fileTitle.content = "FILES"
  footer.content = "l load left  ·  r load right  ·  s swap  ·  ↑/↓ choose file  ·  h history  ·  q quit"
  files.options = fileOptions()
  files.setSelectedIndex(Math.max(0, paths.indexOf(selectedPath ?? "")))
}

/** Reload the history list, keeping the selection on the same entry where possible. */
function showHistory(keepId?: string): void {
  const all = history.list()
  historyEntries = searchHistory(all, historyQuery)
  search.visible = mode === "search" || historyQuery !== ""
  fileTitle.content = historyQuery ? `HISTORY · ${historyEntries.length} of ${all.length}` : `HISTORY · ${all.length}`
  footer.content = mode === "search" ? "Type to search the history  ·  Enter keep results  ·  Esc clear search" : historyFooter
  files.options = historyOptions()
  files.setSelectedIndex(Math.max(0, historyEntries.findIndex((entry) => entry.id === keepId)))
}

/** Clear the search, keeping the selected entry selected. */
function clearSearch(): void {
  const keepId = selectedEntry()?.id
  historyQuery = ""
  search.value = ""
  showHistory(keepId)
}

function setMode(next: typeof mode): void {
  mode = next
  if (mode === "files") {
    showFileList()
    files.focus()
  } else {
    showHistory(selectedEntry()?.id)
    if (mode === "search") search.focus()
    else files.focus()
  }
}

function refresh(): void {
  const paths = allPaths()
  if (!selectedPath || !paths.includes(selectedPath)) selectedPath = paths[0]
  if (mode === "files") showFileList()
  leftTitle.content = sideTitle("LEFT", left)
  rightTitle.content = sideTitle("RIGHT", right)
  renderSelectedFile()
  if (left && right) {
    summary.content = `${paths.length} file${paths.length === 1 ? "" : "s"} across both diffs. Select a file to compare its hunks.`
    summary.fg = "#94a3b8"
  }
}

function showError(error: unknown): void {
  summary.content = error instanceof Error ? error.message : String(error)
  summary.fg = "#fca5a5"
}

function otherSide(side: Side): Side {
  return side === "left" ? "right" : "left"
}

function loadedOn(side: Side): LoadedDiff | undefined {
  return side === "left" ? left : right
}

function setSide(side: Side, loaded: LoadedDiff | undefined): void {
  if (side === "left") left = loaded
  else right = loaded
}

function showSuccess(message: string): void {
  summary.content = message
  summary.fg = "#86efac"
}

async function loadSide(side: Side): Promise<void> {
  let loaded: LoadedDiff
  try {
    loaded = await new ClipboardSource().load()
  } catch (error) {
    showError(error)
    return
  }
  setSide(side, loaded)
  refresh()
  showSuccess(`${side === "left" ? "Left" : "Right"} side loaded from the clipboard.`)
  try {
    if (loaded.text !== undefined) loaded.historyId = history.add(loaded.text, side, loadedOn(otherSide(side))?.historyId).id
  } catch (error) {
    showError(new Error(`Loaded, but could not save to history: ${error instanceof Error ? error.message : String(error)}`))
  }
}

function fromHistory(entry: HistoryEntry): LoadedDiff {
  return { ...loadText(entry.text, "History"), historyId: entry.id }
}

function selectedEntry(): HistoryEntry | undefined {
  const index = files.getSelectedOption()?.value
  return typeof index === "number" ? historyEntries[index] : undefined
}

function loadHistoryEntry(side: Side): void {
  const entry = selectedEntry()
  if (!entry) return
  setSide(side, fromHistory(entry))
  refresh()
  showSuccess(`${side === "left" ? "Left" : "Right"} side loaded from history (${formatTime(entry.savedAt)}).`)
}

/** Open an entry on its own side, together with the text it was compared with. */
function openHistoryPair(): void {
  const entry = selectedEntry()
  if (!entry) return
  const counterpart = history.counterpart(entry)
  setSide(entry.side, fromHistory(entry))
  if (counterpart) setSide(otherSide(entry.side), fromHistory(counterpart))
  refresh()
  if (counterpart) showSuccess(`Opened both sides from history (${formatTime(entry.savedAt)}).`)
  else showSuccess(`Opened on the ${entry.side}; nothing was loaded on the other side when it was saved.`)
}

function deleteHistoryEntry(): void {
  const entry = selectedEntry()
  if (!entry) return
  if (pendingDeleteId !== entry.id) {
    pendingDeleteId = entry.id
    summary.content = "Press d again to delete this history entry, or any other key to keep it."
    summary.fg = "#fbbf24"
    return
  }
  pendingDeleteId = undefined
  const index = historyEntries.indexOf(entry)
  history.remove(entry.id)
  showHistory(historyEntries[index + 1]?.id ?? historyEntries[index - 1]?.id)
  showSuccess("History entry deleted.")
}

function swapSides(): void {
  if (!left && !right) return
  ;[left, right] = [right, left]
  refresh()
  showSuccess("Swapped left and right.")
}

files.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number, option: SelectOption | null) => {
  if (mode !== "files" || !option?.value) return
  selectedPath = option.value as string
  renderSelectedFile()
})

search.on(InputRenderableEvents.INPUT, (value: string) => {
  historyQuery = value
  showHistory()
})

function handleKey(name: string): void {
  if (mode === "search") {
    if (name === "return") setMode("history")
    if (name === "escape") {
      clearSearch()
      setMode("history")
    }
    return
  }

  if (name !== "d") pendingDeleteId = undefined
  if (name === "s") return swapSides()

  if (mode === "history") {
    if (name === "l") loadHistoryEntry("left")
    if (name === "r") loadHistoryEntry("right")
    if (name === "return") openHistoryPair()
    if (name === "d") deleteHistoryEntry()
    if (name === "/") setMode("search")
    if (name === "escape" && historyQuery) clearSearch()
    else if (name === "h" || name === "escape") setMode("files")
    if (name === "q") renderer.destroy()
    return
  }

  if (name === "l") void loadSide("left")
  if (name === "r") void loadSide("right")
  if (name === "h") setMode("history")
  if (name === "q" || name === "escape") renderer.destroy()
}

renderer.keyInput.on("keypress", (key) => {
  const name = key.name === "slash" ? "/" : key.name
  // The "/" that opens the search field should not also be typed into it.
  if (mode === "history" && name === "/") key.preventDefault()
  try {
    handleKey(name)
  } catch (error) {
    showError(error)
  }
})

leftPanel.onSizeChange = renderSelectedFile
rightPanel.onSizeChange = renderSelectedFile

refresh()
files.focus()

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type SelectOption,
} from "@opentui/core"
import { HistoryStore, type HistoryEntry } from "./history"
import type { FileDiff, LoadedDiff } from "./model"
import { formatFile } from "./parse-unified"
import { renderComparison } from "./render-compare"
import { ClipboardSource, loadText } from "./sources"
import { comparePlainText } from "./text-compare"

let left: LoadedDiff | undefined
let right: LoadedDiff | undefined
let selectedPath: string | undefined
let mode: "files" | "history" = "files"
let historyEntries: HistoryEntry[] = []
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
  if (historyEntries.length === 0) return [{ name: "No history yet", description: "Texts you load are saved here", value: null }]
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

function showFileList(): void {
  const paths = allPaths()
  fileTitle.content = "FILES"
  footer.content = "l load left  ·  r load right  ·  ↑/↓ choose file  ·  h history  ·  q quit"
  files.options = fileOptions()
  files.setSelectedIndex(Math.max(0, paths.indexOf(selectedPath ?? "")))
}

function showHistory(): void {
  historyEntries = history.list()
  fileTitle.content = `HISTORY · ${historyEntries.length}`
  footer.content = "l load into left  ·  r load into right  ·  ↑/↓ choose entry  ·  h/Esc back to files  ·  q quit"
  files.options = historyOptions()
  files.setSelectedIndex(0)
}

function setMode(next: typeof mode): void {
  mode = next
  if (mode === "history") showHistory()
  else showFileList()
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

function setSide(side: "left" | "right", loaded: LoadedDiff, message: string): void {
  if (side === "left") left = loaded
  else right = loaded
  summary.content = message
  summary.fg = "#86efac"
  refresh()
}

async function loadSide(side: "left" | "right"): Promise<void> {
  let loaded: LoadedDiff
  try {
    loaded = await new ClipboardSource().load()
  } catch (error) {
    showError(error)
    return
  }
  setSide(side, loaded, `${side === "left" ? "Left" : "Right"} side loaded from the clipboard.`)
  try {
    if (loaded.text !== undefined) history.add(loaded.text, side)
  } catch (error) {
    showError(new Error(`Loaded, but could not save to history: ${error instanceof Error ? error.message : String(error)}`))
  }
}

function loadHistoryEntry(side: "left" | "right"): void {
  const index = files.getSelectedOption()?.value
  if (typeof index !== "number") return
  const entry = historyEntries[index]
  setSide(side, loadText(entry.text, "History"), `${side === "left" ? "Left" : "Right"} side loaded from history (${formatTime(entry.savedAt)}).`)
}

files.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number, option: SelectOption | null) => {
  if (mode !== "files" || !option?.value) return
  selectedPath = option.value as string
  renderSelectedFile()
})

renderer.keyInput.on("keypress", (key) => {
  if (mode === "history") {
    if (key.name === "l") loadHistoryEntry("left")
    if (key.name === "r") loadHistoryEntry("right")
    if (key.name === "h" || key.name === "escape") {
      setMode("files")
      return
    }
  } else {
    if (key.name === "l") void loadSide("left")
    if (key.name === "r") void loadSide("right")
    if (key.name === "h") {
      try {
        setMode("history")
      } catch (error) {
        showError(error)
      }
      return
    }
  }
  if (key.name === "q" || key.name === "escape") renderer.destroy()
})

leftPanel.onSizeChange = renderSelectedFile
rightPanel.onSizeChange = renderSelectedFile

refresh()
files.focus()

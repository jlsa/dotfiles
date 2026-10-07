import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type SelectOption,
} from "@opentui/core"
import type { FileDiff, LoadedDiff } from "./model"
import { formatFile } from "./parse-unified"
import { ClipboardSource } from "./sources"

let left: LoadedDiff | undefined
let right: LoadedDiff | undefined
let selectedPath: string | undefined

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

function refresh(): void {
  const paths = allPaths()
  if (!selectedPath || !paths.includes(selectedPath)) selectedPath = paths[0]
  files.options = fileOptions()
  files.setSelectedIndex(Math.max(0, paths.indexOf(selectedPath ?? "")))
  leftTitle.content = sideTitle("LEFT", left)
  rightTitle.content = sideTitle("RIGHT", right)
  leftDiff.content = left ? formatFile(fileAt(left, selectedPath)) : "Press l to load the clipboard."
  rightDiff.content = right ? formatFile(fileAt(right, selectedPath)) : "Press r to load the clipboard."
  if (left && right) {
    summary.content = `${paths.length} file${paths.length === 1 ? "" : "s"} across both diffs. Select a file to compare its hunks.`
    summary.fg = "#94a3b8"
  }
}

async function loadSide(side: "left" | "right"): Promise<void> {
  try {
    const loaded = await new ClipboardSource().load()
    if (side === "left") left = loaded
    else right = loaded
    summary.content = `${side === "left" ? "Left" : "Right"} diff loaded from the clipboard.`
    summary.fg = "#86efac"
    refresh()
  } catch (error) {
    summary.content = error instanceof Error ? error.message : String(error)
    summary.fg = "#fca5a5"
  }
}

files.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number, option: SelectOption | null) => {
  if (!option?.value) return
  selectedPath = option.value as string
  leftDiff.content = left ? formatFile(fileAt(left, selectedPath)) : "Press l to load the clipboard."
  rightDiff.content = right ? formatFile(fileAt(right, selectedPath)) : "Press r to load the clipboard."
})

renderer.keyInput.on("keypress", (key) => {
  if (key.name === "l") void loadSide("left")
  if (key.name === "r") void loadSide("right")
  if (key.name === "up") files.moveUp()
  if (key.name === "down") files.moveDown()
  if (key.name === "q" || key.name === "escape") renderer.destroy()
})

refresh()
files.focus()

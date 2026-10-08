import { StyledText, bg, bold, fg, type TextChunk } from "@opentui/core"
import type { CompareLine, CompareRow, Segment } from "./text-compare"

type Side = "left" | "right"

const colors = {
  same: "#cbd5e1",
  gutter: "#475569",
  removed: { text: "#fca5a5", line: "#2a1418", changed: "#7f1d1d" },
  added: { text: "#86efac", line: "#0f2419", changed: "#166534" },
}

/** Room taken by the gutter separator and the change marker: " │ " + "- ". */
const PREFIX_WIDTH = 5

/**
 * Wrap segments to the given terminal width, preferring to break after a
 * space. Always returns at least one (possibly empty) visual line.
 */
export function wrapSegments(segments: Segment[], width: number): Segment[][] {
  const cells = segments.flatMap((segment) => [...segment.text].map((char) => ({ char, changed: segment.changed, width: Bun.stringWidth(char) })))
  const result: Segment[][] = []
  let start = 0

  while (start < cells.length) {
    let end = start
    let used = 0
    while (end < cells.length && (end === start || used + cells[end].width <= width)) used += cells[end++].width
    if (end < cells.length) {
      let space = end
      while (space > start && cells[space - 1].char !== " ") space -= 1
      if (space > start) end = space
    }

    const line: Segment[] = []
    for (const cell of cells.slice(start, end)) {
      const last = line.at(-1)
      if (last && last.changed === cell.changed) last.text += cell.char
      else line.push({ text: cell.char, changed: cell.changed })
    }
    result.push(line)
    start = end
  }
  return result.length > 0 ? result : [[]]
}

function renderVisualLine(line: CompareLine, segments: Segment[], first: boolean, side: Side, gutterWidth: number): TextChunk[] {
  const number = first ? String(line.number).padStart(gutterWidth) : " ".repeat(gutterWidth)
  const gutter = fg(colors.gutter)(`${number} │ `)
  if (line.kind === "same") return [gutter, fg(colors.same)(`  ${segments.map((segment) => segment.text).join("")}`)]

  const palette = side === "left" ? colors.removed : colors.added
  const marker = first ? (side === "left" ? "- " : "+ ") : "  "
  return [
    gutter,
    bg(palette.line)(fg(palette.text)(marker)),
    ...segments.map((segment) => segment.changed
      ? bold(bg(palette.changed)(fg("#f8fafc")(segment.text)))
      : bg(palette.line)(fg(palette.text)(segment.text))),
  ]
}

function gutterWidthFor(rows: CompareRow[], side: Side): number {
  return String(rows.reduce((max, row) => Math.max(max, row[side]?.number ?? 0), 0)).length
}

/**
 * Render both sides of an aligned plain-text comparison. Long lines are
 * wrapped here rather than by the terminal, so that every row takes the same
 * number of visual lines on both sides and the panes stay aligned.
 */
export function renderComparison(rows: CompareRow[], widths: Record<Side, number>, maxLines = 500): Record<Side, StyledText | string> {
  if (rows.length === 0) return { left: "(empty)", right: "(empty)" }
  const gutterWidths = { left: gutterWidthFor(rows, "left"), right: gutterWidthFor(rows, "right") }
  const output: Record<Side, TextChunk[]> = { left: [], right: [] }

  rows.slice(0, maxLines).forEach((row, index) => {
    const wrapped = {
      left: row.left ? wrapSegments(row.left.segments, Math.max(1, widths.left - gutterWidths.left - PREFIX_WIDTH)) : [],
      right: row.right ? wrapSegments(row.right.segments, Math.max(1, widths.right - gutterWidths.right - PREFIX_WIDTH)) : [],
    }
    const height = Math.max(wrapped.left.length, wrapped.right.length)

    for (const side of ["left", "right"] as const) {
      const line = row[side]
      for (let visual = 0; visual < height; visual += 1) {
        if (index > 0 || visual > 0) output[side].push(fg(colors.same)("\n"))
        const segments = wrapped[side][visual]
        output[side].push(...(line && segments
          ? renderVisualLine(line, segments, visual === 0, side, gutterWidths[side])
          : [fg(colors.gutter)(`${" ".repeat(gutterWidths[side])} │`)]))
      }
    }
  })

  if (rows.length > maxLines) {
    for (const side of ["left", "right"] as const) output[side].push(fg("#64748b")(`\n… ${rows.length - maxLines} more lines`))
  }
  return { left: new StyledText(output.left), right: new StyledText(output.right) }
}

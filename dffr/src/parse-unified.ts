import type { DiffLine, FileDiff, Hunk } from "./model"

function cleanPath(path: string): string {
  const value = path.trim().split("\t", 1)[0]
  if (value === "/dev/null") return value
  return value.replace(/^[ab]\//, "")
}

function lineKind(line: string): DiffLine["kind"] {
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-")) return "remove"
  if (line.startsWith("\\")) return "meta"
  return "context"
}

/** Parse the portable unified-diff format emitted by Git and most code hosts. */
export function parseUnifiedDiff(input: string): FileDiff[] {
  const files: FileDiff[] = []
  const lines = input.replace(/\r\n/g, "\n").split("\n")
  let file: FileDiff | undefined
  let hunk: Hunk | undefined

  const finishFile = () => {
    if (file && file.hunks.length > 0) files.push(file)
    file = undefined
    hunk = undefined
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile()
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
      file = { path: match?.[2] ?? line.slice("diff --git ".length), hunks: [] }
      continue
    }

    if (line.startsWith("--- ")) {
      if (!file) file = { path: "Unknown file", hunks: [] }
      continue
    }

    if (line.startsWith("+++ ")) {
      if (!file) file = { path: "Unknown file", hunks: [] }
      const nextPath = cleanPath(line.slice(4))
      if (nextPath !== "/dev/null") file.path = nextPath
      continue
    }

    if (line.startsWith("@@ ")) {
      if (!file) file = { path: "Unknown file", hunks: [] }
      hunk = { header: line, lines: [] }
      file.hunks.push(hunk)
      continue
    }

    if (hunk) hunk.lines.push({ kind: lineKind(line), content: line })
  }
  finishFile()
  return files
}

export function formatFile(file: FileDiff | undefined, maxLines = 500): string {
  if (!file) return "This file does not exist in this diff."
  const result: string[] = []
  for (const hunk of file.hunks) {
    result.push(hunk.header)
    result.push(...hunk.lines.map((line) => line.content))
  }
  if (result.length > maxLines) {
    return [...result.slice(0, maxLines), `… ${result.length - maxLines} more lines`].join("\n")
  }
  return result.join("\n") || "No content changes."
}

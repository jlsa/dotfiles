export type DiffLineKind = "add" | "remove" | "context" | "meta"

export interface DiffLine {
  kind: DiffLineKind
  content: string
}

export interface Hunk {
  header: string
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  hunks: Hunk[]
}

export interface LoadedDiff {
  files: FileDiff[]
  source: string
}

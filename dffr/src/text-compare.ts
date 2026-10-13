export interface Segment {
  text: string
  changed: boolean
}

export type CompareLineKind = "same" | "remove" | "add" | "change"

export interface CompareLine {
  kind: CompareLineKind
  /** 1-based line number in the original text of this side. */
  number: number
  segments: Segment[]
}

/** One aligned row; a missing side is rendered as an empty filler line. */
export interface CompareRow {
  left?: CompareLine
  right?: CompareLine
}

type Op<T> = { kind: "same"; left: T; right: T } | { kind: "remove"; left: T } | { kind: "add"; right: T }

/** Character-level comparisons above this many table cells fall back to marking the whole line. */
const MAX_CHAR_CELLS = 250_000

function lines(text: string): string[] {
  const result = text.replace(/\r\n/g, "\n").split("\n")
  if (result.at(-1) === "") result.pop()
  return result
}

/** Align two sequences with a longest-common-subsequence comparison. */
function diffSequences<T>(left: T[], right: T[]): Op<T>[] {
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0))

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? table[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1])
    }
  }

  const ops: Op<T>[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      ops.push({ kind: "same", left: left[leftIndex++], right: right[rightIndex++] })
    } else if (rightIndex < right.length && (leftIndex === left.length || table[leftIndex][rightIndex + 1] >= table[leftIndex + 1][rightIndex])) {
      ops.push({ kind: "add", right: right[rightIndex++] })
    } else {
      ops.push({ kind: "remove", left: left[leftIndex++] })
    }
  }
  return ops
}

function pushSegment(segments: Segment[], text: string, changed: boolean): void {
  const last = segments.at(-1)
  if (last && last.changed === changed) last.text += text
  else segments.push({ text, changed })
}

/** Highlight the characters that differ between two versions of one line. */
export function compareCharacters(leftLine: string, rightLine: string): { left: Segment[]; right: Segment[] } {
  const leftChars = [...leftLine]
  const rightChars = [...rightLine]
  if (leftChars.length * rightChars.length > MAX_CHAR_CELLS) {
    return { left: [{ text: leftLine, changed: true }], right: [{ text: rightLine, changed: true }] }
  }

  const left: Segment[] = []
  const right: Segment[] = []
  for (const op of diffSequences(leftChars, rightChars)) {
    if (op.kind === "same") {
      pushSegment(left, op.left, false)
      pushSegment(right, op.right, false)
    } else if (op.kind === "remove") {
      pushSegment(left, op.left, true)
    } else {
      pushSegment(right, op.right, true)
    }
  }
  return { left, right }
}

function plain(kind: CompareLineKind, number: number, text: string): CompareLine {
  return { kind, number, segments: [{ text, changed: false }] }
}

/**
 * Align two texts line by line. Removed and added lines between the same
 * unchanged lines are paired up as changed lines with character highlights.
 */
export function comparePlainText(leftText: string, rightText: string): CompareRow[] {
  const rows: CompareRow[] = []
  let removed: string[] = []
  let added: string[] = []
  let leftNumber = 0
  let rightNumber = 0

  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index += 1) {
      const leftLine = removed[index]
      const rightLine = added[index]
      if (leftLine !== undefined && rightLine !== undefined) {
        const characters = compareCharacters(leftLine, rightLine)
        rows.push({
          left: { kind: "change", number: ++leftNumber, segments: characters.left },
          right: { kind: "change", number: ++rightNumber, segments: characters.right },
        })
      } else if (leftLine !== undefined) {
        rows.push({ left: plain("remove", ++leftNumber, leftLine) })
      } else {
        rows.push({ right: plain("add", ++rightNumber, rightLine) })
      }
    }
    removed = []
    added = []
  }

  for (const op of diffSequences(lines(leftText), lines(rightText))) {
    if (op.kind === "remove") removed.push(op.left)
    else if (op.kind === "add") added.push(op.right)
    else {
      flush()
      rows.push({ left: plain("same", ++leftNumber, op.left), right: plain("same", ++rightNumber, op.right) })
    }
  }
  flush()
  return rows
}

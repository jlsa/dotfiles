import { describe, expect, test } from "bun:test"
import { renderComparison, wrapSegments } from "./render-compare"
import { comparePlainText } from "./text-compare"

function visualLines(text: { chunks: { text: string }[] } | string): string[] {
  return (typeof text === "string" ? text : text.chunks.map((chunk) => chunk.text).join("")).split("\n")
}

describe("wrapSegments", () => {
  test("breaks after a space and keeps highlights on the right characters", () => {
    expect(wrapSegments([{ text: "aaa ", changed: false }, { text: "bbb ccc", changed: true }], 8)).toEqual([
      [{ text: "aaa ", changed: false }, { text: "bbb ", changed: true }],
      [{ text: "ccc", changed: true }],
    ])
  })

  test("hard-breaks a word longer than the width", () => {
    expect(wrapSegments([{ text: "abcdefg", changed: false }], 3).map((line) => line[0].text)).toEqual(["abc", "def", "g"])
  })

  test("returns one empty line for an empty line", () => {
    expect(wrapSegments([{ text: "", changed: false }], 10)).toEqual([[]])
  })
})

describe("renderComparison", () => {
  test("gives every row the same height on both sides", () => {
    const long = "word ".repeat(20).trim()
    const rows = comparePlainText(`a\n${long}\nb`, "a\nb")
    const rendered = renderComparison(rows, { left: 30, right: 30 })
    const left = visualLines(rendered.left)
    const right = visualLines(rendered.right)

    expect(left.length).toBe(right.length)
    expect(left.length).toBeGreaterThan(3)
    expect(left.at(-1)).toBe("3 │   b")
    expect(right.at(-1)).toBe("2 │   b")
    expect(Math.max(...left.map((line) => Bun.stringWidth(line)))).toBeLessThanOrEqual(30)
  })
})

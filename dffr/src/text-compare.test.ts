import { describe, expect, test } from "bun:test"
import { compareCharacters, comparePlainText } from "./text-compare"

describe("comparePlainText", () => {
  test("aligns unchanged lines and marks additions and removals", () => {
    const rows = comparePlainText("test\n1\n2\n3", "1\n2\ntest\n3")
    expect(rows.map((row) => [row.left?.kind, row.right?.kind])).toEqual([
      ["remove", undefined],
      ["same", "same"],
      ["same", "same"],
      [undefined, "add"],
      ["same", "same"],
    ])
  })

  test("pairs a removed and an added line as one changed row", () => {
    const rows = comparePlainText("a\nhello world\nb", "a\nhello there\nb")
    expect(rows).toHaveLength(3)
    expect(rows[1].left?.kind).toBe("change")
    expect(rows[1].right?.kind).toBe("change")
  })

  test("numbers each line after its position in its own text", () => {
    const rows = comparePlainText("test\n1\n2\n3", "1\n2\ntest\n3")
    expect(rows.map((row) => [row.left?.number, row.right?.number])).toEqual([
      [1, undefined],
      [2, 1],
      [3, 2],
      [undefined, 3],
      [4, 4],
    ])
  })

  test("keeps surplus lines of a changed block on their own rows", () => {
    const rows = comparePlainText("one\ntwo", "uno")
    expect(rows.map((row) => [row.left?.kind, row.right?.kind])).toEqual([
      ["change", "change"],
      ["remove", undefined],
    ])
  })
})

describe("compareCharacters", () => {
  test("highlights only the characters that differ", () => {
    expect(compareCharacters("const a = 1", "const b = 1")).toEqual({
      left: [{ text: "const ", changed: false }, { text: "a", changed: true }, { text: " = 1", changed: false }],
      right: [{ text: "const ", changed: false }, { text: "b", changed: true }, { text: " = 1", changed: false }],
    })
  })

  test("marks the whole line when it is too long to compare", () => {
    const long = "x".repeat(1000)
    expect(compareCharacters(long, `${long}y`).right).toEqual([{ text: `${long}y`, changed: true }])
  })
})

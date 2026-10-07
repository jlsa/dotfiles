import { describe, expect, test } from "bun:test"
import { comparePlainText } from "./text-compare"

describe("comparePlainText", () => {
  test("aligns unchanged lines and marks additions and removals", () => {
    expect(comparePlainText("test\n1\n2\n3", "1\n2\ntest\n3")).toEqual({
      left: "- test\n  1\n  2\n\n  3",
      right: "\n  1\n  2\n+ test\n  3",
    })
  })
})

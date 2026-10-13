import { describe, expect, test } from "bun:test"
import { parseArgs } from "./commands"

describe("parseArgs", () => {
  test("separates positional arguments from flags", () => {
    expect(parseArgs(["add", "13", "--km", "42", "--note", "klant", "--csv"])).toEqual({
      positional: ["add", "13"],
      flags: { km: "42", note: "klant", csv: true },
    })
  })

  test("keeps -1 as a month argument and reads --flag=value", () => {
    expect(parseArgs(["export", "-1", "--out=/tmp/x.csv", "--copy"])).toEqual({ positional: ["export", "-1"], flags: { out: "/tmp/x.csv", copy: true } })
  })

  test("complains about a value flag without a value", () => {
    expect(() => parseArgs(["add", "--km"])).toThrow("--km needs a value")
  })
})

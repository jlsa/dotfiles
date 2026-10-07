import { describe, expect, test } from "bun:test"
import { formatFile, parsePlainText, parseUnifiedDiff } from "./parse-unified"

const diff = `diff --git a/src/a.ts b/src/a.ts
index 123..456 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-old
+new
 keep
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hello
`

describe("parseUnifiedDiff", () => {
  test("groups hunks under their destination path", () => {
    const files = parseUnifiedDiff(diff)
    expect(files.map((file) => file.path)).toEqual(["src/a.ts", "new.txt"])
    expect(files[0].hunks[0].lines.map((line) => line.kind)).toEqual(["remove", "add", "context"])
  })

  test("renders a file without metadata", () => {
    expect(formatFile(parseUnifiedDiff(diff)[0])).toBe("@@ -1,2 +1,2 @@\n-old\n+new\n keep")
  })

  test("models plain text as one virtual file without diff markers", () => {
    const files = parsePlainText("first line\r\nsecond line\r\n")
    expect(files[0].path).toBe("Clipboard text")
    expect(formatFile(files[0])).toBe("first line\nsecond line")
  })
})

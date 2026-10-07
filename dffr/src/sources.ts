import { parsePlainText, parseUnifiedDiff } from "./parse-unified"
import type { LoadedDiff } from "./model"

export interface DiffSource {
  name: string
  load(): Promise<LoadedDiff>
}

export class ClipboardSource implements DiffSource {
  name = "Clipboard"

  async load(): Promise<LoadedDiff> {
    const result = Bun.spawnSync(["pbpaste"])
    if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim() || "Could not read the clipboard.")
    const text = result.stdout.toString()
    if (!text.trim()) throw new Error("The clipboard is empty.")
    const files = parseUnifiedDiff(text)
    return files.length > 0
      ? { files, source: this.name, kind: "unified-diff" }
      : { files: parsePlainText(text), source: `${this.name} text`, kind: "plain-text", text }
  }
}

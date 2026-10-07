import { parseUnifiedDiff } from "./parse-unified"
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
    if (files.length === 0) throw new Error("The clipboard does not contain a unified diff.")
    return { files, source: this.name }
  }
}

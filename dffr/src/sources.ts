import { parsePlainText, parseUnifiedDiff } from "./parse-unified"
import type { LoadedDiff } from "./model"

export interface DiffSource {
  name: string
  load(): Promise<LoadedDiff>
}

/** Interpret text as a unified diff when possible, and as plain text otherwise. */
export function loadText(text: string, source: string): LoadedDiff {
  const files = parseUnifiedDiff(text)
  return files.length > 0
    ? { files, source, kind: "unified-diff", text }
    : { files: parsePlainText(text), source: `${source} text`, kind: "plain-text", text }
}

export class ClipboardSource implements DiffSource {
  name = "Clipboard"

  async load(): Promise<LoadedDiff> {
    const result = Bun.spawnSync(["pbpaste"])
    if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim() || "Could not read the clipboard.")
    const text = result.stdout.toString()
    if (!text.trim()) throw new Error("The clipboard is empty.")
    return loadText(text, this.name)
  }
}

import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type SelectOption,
} from "@opentui/core"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { filterSessions, loadSessions, type Session } from "./sessions"

const initialQuery = process.argv.slice(2).join(" ")
const database = process.env.OPENCODE_DB ?? join(process.env.HOME ?? "", ".local/share/opencode/opencode.db")

if (!existsSync(database)) {
  console.error(`ocs: session database not found: ${database}`)
  process.exit(1)
}

let sessions: Session[]
try {
  sessions = loadSessions(database)
} catch (error) {
  console.error(`ocs: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const renderer = await createCliRenderer({
  screenMode: "alternate-screen",
  exitOnCtrlC: true,
  targetFps: 30,
})

const root = new BoxRenderable(renderer, {
  id: "app",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  padding: 1,
  backgroundColor: "#101418",
})
const title = new TextRenderable(renderer, {
  id: "title",
  content: " OpenCode sessions ",
  fg: "#7dd3fc",
})
const searchBox = new BoxRenderable(renderer, {
  id: "search-box",
  borderStyle: "rounded",
  borderColor: "#334155",
  height: 3,
  width: "100%",
  paddingLeft: 1,
  paddingRight: 1,
})
const search = new InputRenderable(renderer, {
  id: "search",
  placeholder: "Search by title or project directory…",
  width: "100%",
  textColor: "#e2e8f0",
  cursorColor: "#7dd3fc",
})
const list = new SelectRenderable(renderer, {
  id: "sessions",
  width: "100%",
  flexGrow: 1,
  marginTop: 1,
  showDescription: true,
  showScrollIndicator: true,
  wrapSelection: true,
  backgroundColor: "#101418",
  focusedBackgroundColor: "#101418",
  selectedBackgroundColor: "#1e3a5f",
  selectedTextColor: "#f8fafc",
  textColor: "#cbd5e1",
  descriptionColor: "#64748b",
  selectedDescriptionColor: "#bae6fd",
})
const footer = new TextRenderable(renderer, {
  id: "footer",
  content: "↑/↓ select  •  Enter open  •  Esc clear/exit  •  Ctrl+C exit",
  fg: "#64748b",
  height: 1,
  marginTop: 1,
})

searchBox.add(search)
root.add(title)
root.add(searchBox)
root.add(list)
root.add(footer)
renderer.root.add(root)

function asOptions(items: Session[]): SelectOption[] {
  if (sessions.length === 0) {
    return [{ name: "No sessions yet", description: "Start a session first with: opencode", value: null }]
  }
  if (items.length === 0) {
    return [{ name: "No results", description: "Try a different search", value: null }]
  }
  return items.map((session) => ({
    name: `${session.title}  ·  ${session.updated}`,
    description: session.directory,
    value: session,
  }))
}

function updateList(query: string): void {
  list.options = asOptions(filterSessions(sessions, query))
  list.setSelectedIndex(0)
}

async function openSession(session: Session): Promise<void> {
  if (!existsSync(session.directory)) {
    footer.content = `Project directory no longer exists: ${session.directory}`
    footer.fg = "#fca5a5"
    return
  }

  renderer.destroy()
  process.chdir(session.directory)
  const child = Bun.spawn(["opencode", "--session", session.id], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  process.exit(await child.exited)
}

search.value = initialQuery
updateList(initialQuery)
search.on(InputRenderableEvents.INPUT, (value: string) => updateList(value))
list.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
  if (option.value) void openSession(option.value as Session)
})

renderer.keyInput.on("keypress", (key) => {
  if (key.name === "up") list.moveUp()
  if (key.name === "down") list.moveDown()
  if (key.name === "return") list.selectCurrent()
  if (key.name === "escape") {
    if (search.value.length > 0) {
      search.value = ""
      updateList("")
    } else {
      renderer.destroy()
    }
  }
})

search.focus()

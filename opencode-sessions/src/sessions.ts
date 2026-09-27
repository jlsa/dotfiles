export interface Session {
  id: string
  title: string
  directory: string
  updated: string
}

export function loadSessions(database: string): Session[] {
  const query = `
    SELECT id,
      replace(replace(title, char(9), ' '), char(10), ' ') AS title,
      replace(replace(directory, char(9), ' '), char(10), ' ') AS directory,
      datetime(time_updated / 1000, 'unixepoch', 'localtime') AS updated
    FROM session
    WHERE parent_id IS NULL AND time_archived IS NULL
    ORDER BY time_updated DESC;
  `
  const result = Bun.spawnSync(["sqlite3", "-json", database, query])

  if (result.exitCode !== 0) {
    const message = result.stderr.toString().trim() || "the database could not be read"
    throw new Error(message)
  }

  const output = result.stdout.toString().trim()
  return output ? (JSON.parse(output) as Session[]) : []
}

export function filterSessions(sessions: Session[], query: string): Session[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return sessions

  return sessions.filter((session) => {
    const haystack = `${session.title} ${session.directory}`.toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

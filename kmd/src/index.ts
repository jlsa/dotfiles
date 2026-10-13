import { run } from "./commands"
import { isMonthArgument, parseMonth } from "./month"
import { runTui } from "./tui"

const argv = process.argv.slice(2)

try {
  if (argv.length === 0 || (argv.length === 1 && isMonthArgument(argv[0]))) {
    await runTui(parseMonth(argv[0]))
  } else if (argv[0] === "--help" || argv[0] === "-h") {
    process.exit(run(["help"]))
  } else {
    process.exit(run(argv))
  }
} catch (error) {
  console.error(`kmd: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

export interface TextComparison {
  left: string
  right: string
}

function lines(text: string): string[] {
  const result = text.replace(/\r\n/g, "\n").split("\n")
  if (result.at(-1) === "") result.pop()
  return result
}

/** Align two texts with a longest-common-subsequence comparison. */
export function comparePlainText(leftText: string, rightText: string): TextComparison {
  const left = lines(leftText)
  const right = lines(rightText)
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0))

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? table[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1])
    }
  }

  const leftOutput: string[] = []
  const rightOutput: string[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      leftOutput.push(`  ${left[leftIndex++]}`)
      rightOutput.push(`  ${right[rightIndex++]}`)
    } else if (rightIndex < right.length && (leftIndex === left.length || table[leftIndex][rightIndex + 1] >= table[leftIndex + 1][rightIndex])) {
      leftOutput.push("")
      rightOutput.push(`+ ${right[rightIndex++]}`)
    } else {
      leftOutput.push(`- ${left[leftIndex++]}`)
      rightOutput.push("")
    }
  }

  return { left: leftOutput.join("\n"), right: rightOutput.join("\n") }
}

export type IgnorePattern = {
  name: string
  target: IgnoreTarget
  type: IgnoreType
  value: RegExp | string
}

export type IgnoreTarget = 'host' | 'msg'

export type IgnoreType = 'exact' | 'include' | 'regexp'

export const compileIgnorePattern = (pattern: IgnorePattern): IgnorePattern | undefined => {
  if (pattern.type === 'regexp')
    try {
      const compiled = {
        name: pattern.name,
        target: pattern.target,
        type: pattern.type,
        value: new RegExp(pattern.value),
      }
      return compiled
    }
    catch (error: unknown) {
      console.error(`[ignorePatterns] ${error}`)
      return undefined
    }
  else
    return pattern
}

export const shouldBeIgnored = (matched: RegExpMatchArray, patterns: IgnorePattern[]): boolean => patterns.some((pattern: IgnorePattern) => shouldBeIgnoredOne(matched, pattern))

const shouldBeIgnoredOne = (matched: RegExpMatchArray, pattern: IgnorePattern): boolean => {
  const { groups } = matched
  if (groups) {
    const text = groups[pattern.target]
    switch (pattern.type) {
      case 'exact':
        return text === pattern.value
      case 'include':
        return text.includes(pattern.value as string)
      case 'regexp':
        return (pattern.value as RegExp).test(text)
    }
  }
}

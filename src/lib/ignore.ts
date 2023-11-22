import { IgnorePattern, Log } from '..'

export const compileIgnorePattern = (pattern: IgnorePattern): IgnorePattern | undefined => pattern.type === 'regexp' ? doCompile(pattern) : pattern

const doCompile = (pattern: IgnorePattern): IgnorePattern | undefined => {
  const { name, target, type, value } = pattern
  try {
    const compiled = {
      name,
      target,
      type,
      value: new RegExp(value),
    }
    return compiled
  }
  catch (error: unknown) {
    console.error(`[ignorePatterns] '${name}' ${error}`)
    return undefined
  }
}

export const shouldBeIgnored = (log: Log, patterns: IgnorePattern[]): boolean => patterns.some(
  (pattern: IgnorePattern) => shouldBeIgnoredOne(log, pattern)
)

const shouldBeIgnoredByRegExp = (pattern: IgnorePattern, text: string): boolean => (pattern.value as RegExp).test(text)

const shouldBeIgnoredExactly = (pattern: IgnorePattern, text: string): boolean => text === pattern.value

const shouldBeIgnoredInclusively = (pattern: IgnorePattern, text: string): boolean => text.includes(pattern.value as string)

const shouldBeIgnoredOne = (log: Log, pattern: IgnorePattern): boolean => {
  const f = template[pattern.type]
  return f?.(pattern, log[pattern.target])
}

const template = {
  exact: shouldBeIgnoredExactly,
  include: shouldBeIgnoredInclusively,
  regexp: shouldBeIgnoredByRegExp,
} as const

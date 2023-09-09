export const replaceVariables = (data: Buffer | string): Buffer => Buffer.from(replaceVariablesRecursively(data.toString()))

const replaceVariablesRecursively = (text: string): string => {
  for (const m of text.matchAll(variableRE)) {
    const name = m.groups.name.toLowerCase()
    text = name in env ? replaceVariablesRecursively(text.replace(m[0], env[name])) : text.replace(m[0], '')
  }
  return text
}

const env = {} as Record<string, string>
for (const name in process.env)
  env[name.toLowerCase()] = process.env[name]

const variableRE = /\$\{(?<name>\w+)\}/g

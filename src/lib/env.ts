type ReplaceContext = {
  map: Map<string, string>
  replaced?: true
  text: string
}

export const applyEnvironmentVariables = (text: string): string => {
  const { env } = process
  const map = new Map<string, string>()
  for (const name in env)
    map.set(name.toUpperCase(), env[name])
  const ctx: ReplaceContext = { map, text }
  do {
    replace(ctx)
  } while (ctx.replaced)
  return ctx.text
}

const replace = (ctx: ReplaceContext): void => {
  delete ctx.replaced
  for (const matched of ctx.text.matchAll(variableRE)) {
    const name = matched.groups.name.toUpperCase()
    const value = ctx.map.get(name) ?? ''
    ctx.replaced ??= true
    ctx.text = ctx.text.replace(matched[0], value)
  }
}

const variableRE = /\$\{(?<name>[_\w]+)\}/g

export type IgnorePattern = {
  name: string
  target: IgnoreTarget
  type: IgnoreType
  value: RegExp | string
}

export type IgnoreTarget = 'host' | 'msg'

export type IgnoreType = 'exact' | 'include' | 'regexp'

export const isIgnorePattern = (value: unknown): value is IgnorePattern => {
  const pattern = value as IgnorePattern
  return typeof value === 'object' && typeof pattern.name === 'string'
}

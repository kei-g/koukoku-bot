export type Log = {
  log: string
}

export type RedisStreamItem<T extends Record<string, string>> = {
  id: string
  message: T
}

export type Speech = {
  body: string
  date: string
  hash: string
  host: string
  time: string
}

type SpeechKeyType = keyof Speech

const isRedisStreamItem = <T extends Record<string, string>>(value: unknown): value is RedisStreamItem<T> => {
  const item = value as RedisStreamItem<T>
  return typeof value === 'object' && typeof item.id === 'string' && typeof item.message === 'object'
}

export const isRedisStreamItemLog = (value: unknown): value is RedisStreamItem<Log> => {
  const item = value as RedisStreamItem<Log>
  return isRedisStreamItem(value) && typeof item.message.log === 'string'
}

export const isRedisStreamItemSpeech = (value: unknown): value is RedisStreamItem<Speech> => {
  const item = value as RedisStreamItem<Speech>
  return isRedisStreamItem(value) && speechKeyTypes.every((key: SpeechKeyType) => typeof item.message[key] === 'string')
}

export const selectBodyOfLog = (item: RedisStreamItem<Log>) => item.message.log

const speechKeyTypes: Readonly<SpeechKeyType[]> = [
  'body',
  'date',
  'hash',
  'host',
  'time',
] as const

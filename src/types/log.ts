type Common = {
  body: string
  date: string
  host: string
  time: string
}

export type DayOfWeek = '日' | '月' | '火' | '水' | '木' | '金' | '土'

export type Log = Common & {
  dow: DayOfWeek
  forgery?: '※ 贋作 DNS 逆引の疑い'
  self?: '〈＊あなた様＊〉'
}

type LogKeyType = keyof Log

export type LogOrSpeechWithTimestamp = {
  item: RedisStreamItem<Log> | RedisStreamItem<Speech>
  timestamp: number
}

export type RedisStreamItem<T extends Record<string, string>> = {
  id: string
  message: T
}

export type Speech = Common & {
  estimated?: string
  finished?: string
  hash: string
}

type SpeechKeyType = keyof Speech

const isRedisStreamItem = <T extends Record<string, string>>(value: unknown): value is RedisStreamItem<T> => {
  const item = value as RedisStreamItem<T>
  return typeof value === 'object' && typeof item.id === 'string' && typeof item.message === 'object'
}

export const isRedisStreamItemLog = (value: unknown): value is RedisStreamItem<Log> => {
  const item = value as RedisStreamItem<Log>
  return isRedisStreamItem(value) && logKeyTypes.every((key: LogKeyType) => typeof item.message[key] === 'string')
}

export const isRedisStreamItemLogOrSpeech = (value: unknown): value is RedisStreamItem<Log> | RedisStreamItem<Speech> => isRedisStreamItemLog(value) || isRedisStreamItemSpeech(value)

export const isRedisStreamItemSpeech = (value: unknown): value is RedisStreamItem<Speech> => {
  const item = value as RedisStreamItem<Speech>
  return isRedisStreamItem(value) && speechKeyTypes.every((key: SpeechKeyType) => typeof item.message[key] === 'string')
}

const logKeyTypes: Readonly<LogKeyType[]> = [
  'body',
  'date',
  'dow',
  'host',
  'time',
]

export const recompose = (log: Log) => {
  const { body, date, dow, forgery, host, self, time } = log
  const prefix = '>> 「 ' + body + ' 」(チャット放話 - ' + date + ' (' + dow + ') ' + time + ' by ' + host
  const index = 2 * +(forgery === undefined) + +(self === undefined)
  const text = [
    '(' + forgery + ') 君 ' + self,
    '(' + forgery + ') 君',
    '君' + self,
    '君',
  ][index]
  return [prefix, text, ') <<'].join(' ')
}

export const selectBodyOfLog = (item: RedisStreamItem<Log>) => item.message.body

const speechKeyTypes: Readonly<SpeechKeyType[]> = [
  'body',
  'date',
  'hash',
  'host',
  'time',
] as const

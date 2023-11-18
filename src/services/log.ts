import {
  CommandService,
  DatabaseService,
  FilterFunction,
  Injectable,
  KoukokuProxyService,
  Log,
  RedisStreamItem,
  Speech,
  SpeechService,
  abbreviateHostName,
  formatDateTimeToFullyQualifiedString,
  isRedisStreamItemLog,
  parseIntOr,
  twoDigitString,
} from '..'
import { RedisCommandArgument } from '@redis/client/dist/lib/commands'

type ComposingContext = {
  host?: string
  message?: string
}

@Injectable({
  DependsOn: [
    DatabaseService,
    KoukokuProxyService,
    SpeechService,
  ]
})
export class LogService implements CommandService {
  readonly #db: DatabaseService
  readonly #key: string
  readonly #proxyService: KoukokuProxyService
  readonly #regexp = /^(バック)?ログ(\s+((?<command>--help)|(?<count>[1-9]\d*)?(\s?since\s?(?<since>\d+(([-/]\d+){1,2}(\s\d+(:\d+){1,2})?)?))?(\s?until\s?(?<until>\d+(([-/]\d+){1,2}(\s\d+(:\d+){1,2})?)?))?))?$/
  readonly #speechService: SpeechService

  async #execute(count: string | undefined, rawMessage: string, since: string | undefined, until: string | undefined): Promise<void> {
    const end = interpretAsDateOr(since, '-')
    const start = interpretAsDateOr(until, '+')
    const range = formatDateTimeRange(end, start) ?? '{未指定}'
    const index = +(since === undefined) * 2 + +(until === undefined)
    const contents = [] as string[]
    const last = {} as ComposingContext
    const filter = except(rawMessage)
    const suffix = ['', '-9'][+(typeof start === 'number')]
    for (const item of await this.query(`${start}${suffix}`, `${end}`))
      isRedisStreamItemLog(item)
        ? contents.push(...composeLogs(last, item, filter))
        : contents.push(...composeLogsFromSpeech(last, item))
    const { length } = contents
    console.log({ count, end, index, length, range, since, start, until })
    if (length) {
      const c = Math.min(parseIntOr(count, 10), 30)
      await this.#proxyService.post(`[Bot] 範囲:'${range}' に対して ${c} 件のログを表示します (全部で ${length} 件)`)
      await this.#speechService.create(sliceItems(contents, c, index === 1).join('\n'))
    }
    else
      await this.#proxyService.post(`[Bot] 範囲:'${range}' に該当するログがありません`)
  }

  constructor(
    db: DatabaseService,
    proxyService: KoukokuProxyService,
    speechService: SpeechService
  ) {
    this.#db = db
    this.#key = process.env.REDIS_LOG_KEY ?? 'koukoku:log'
    this.#proxyService = proxyService
    this.#speechService = speechService
  }

  async execute(matched: RegExpMatchArray, rawMessage: string): Promise<void> {
    const { command, count, since, until } = matched.groups
    if (command) {
      const name = command.slice(2).toLowerCase()
      await this.#speechService.createFromFile(`templates/log/${name}.txt`)
    }
    else
      await this.#execute(count, rawMessage, since, until)
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  prepend(log: Log): Promise<RedisStreamItem<Log>>
  prepend(speech: Speech): Promise<RedisStreamItem<Speech>>
  async prepend(message: Log | Speech): Promise<unknown> {
    const id = await this.#db.xAdd(this.#key, message)
    return { id, message }
  }

  async query(start: RedisCommandArgument, end: RedisCommandArgument, count?: number): Promise<(RedisStreamItem<Log> | RedisStreamItem<Speech>)[]> {
    const items = await this.#db.xRevRange(this.#key, start, end, count)
    return items as (RedisStreamItem<Log> | RedisStreamItem<Speech>)[]
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

const applyFilters = <T>(source: T[], ...filters: FilterFunction<T>[]): T[] => filters.reduce(
  (items: T[], filter: FilterFunction<T>) => items.filter(filter),
  source
)

function* composeLogs(last: ComposingContext, item: RedisStreamItem<Log>, ...filters: FilterFunction<RegExpMatchArray>[]) {
  const message = item.message.log.replaceAll(/\r?\n/g, '')
  const matches = [...message.matchAll(messageRE)]
  for (const matched of applyFilters(matches, isNotBot, isNotTimeSignal, ...filters)) {
    const current = {
      host: abbreviateHostName(matched.groups.host),
      message: matched.groups.body.trim(),
    }
    current.host === last.host ? current.host = '〃' : last.host = current.host
    current.message === last.message ? current.message = '〃' : last.message = current.message
    yield [
      matched.groups.date,
      matched.groups.time,
      current.message,
      current.host,
    ].join(' ')
  }
}

function* composeLogsFromSpeech(last: ComposingContext, item: RedisStreamItem<Speech>) {
  const lines = item.message.body.split(/\r?\n/)
  if (!lines.at(0)?.match(/^\s*\[Bot\]/)) {
    const { length } = lines
    const suffix = [` ${length - 1} 行省略`, ''][+(length === 1)]
    const current = {
      host: item.message.host.replaceAll(/(\*+[-.]?)+/g, ''),
    }
    current.host === last.host ? current.host = '〃' : last.host = current.host
    delete last.message
    const matched = item.message.date.match(/(?<month>\d+)\s月\s(?<day>\d+)\s日/)
    const { month, day } = matched.groups
    const date = [month, day].map(twoDigitString).join('/')
    yield `${date} ${item.message.time}:** ${lines[0]}${suffix} ${current.host}`
  }
}

const convertDateComponents = (dateComponents: number[] | undefined): Date | undefined => {
  if (dateComponents) {
    const { length } = dateComponents
    const year = [new Date().getFullYear(), dateComponents[0]][length - 2]
    const month = [dateComponents[0], dateComponents[1]][length - 2]
    const day = [dateComponents[1], dateComponents[2]][length - 2]
    return new Date(year, month - 1, day)
  }
}

const convertDateTimeComponents = (dateComponents: number[] | undefined, components: string[]): Date | undefined => {
  const date = convertDateComponents(dateComponents)
  const timeComponents = components?.[1]?.split(/[-:]/)?.map(parseStringAsDecimalInteger)
  if (date && timeComponents) {
    const { length } = timeComponents
    const second = [0, timeComponents[2]][+(length === 3)]
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      timeComponents[0],
      timeComponents[1],
      second
    )
  }
}

const convertFromUnixEpochTime = (value: number): Date | undefined => {
  if (!isNaN(value))
    return new Date(value)
}

const except = (text: string) => (matched: RegExpMatchArray) => !(matched[0] === text)

const formatDateTimeRange = (from: number | '-', to: number | '+') => {
  const [since, until] = [from, to].map((value: number | '-' | '+') => new Date(value)).map(formatDateTimeToFullyQualifiedString)
  const value = +(since === undefined) * 2 + +(until === undefined)
  if (value < 3)
    return `${since?.concat('から') ?? ''}${until?.concat('まで') ?? ''}`
}

/**
 * Interprets a string as a datetime, and returns its elapsed time in milliseconds since Jan 01, 1970, 00:00:00.
 *
 * @param {string | undefined} text
 *
 * @param {T} alternateValue
 *
 * @returns {T | number} The elapsed time in milliseconds since Jan 01, 1970, 00:00:00 if the format of `text` is valid. Otherwise, `alternateValue`
 */
const interpretAsDateOr = <T>(text: string | undefined, alternateValue: T): T | number => {
  const components = text?.split(' ')
  const dateComponents = components?.[0]?.split(/[-/]/)?.map(parseStringAsDecimalInteger)
  const maybeDate = components?.length === 1
    ? (
      dateComponents?.length === 1
        ? convertFromUnixEpochTime(dateComponents[0])
        : convertDateComponents(dateComponents)
    )
    : convertDateTimeComponents(dateComponents, components)
  return maybeDate?.getTime() ?? alternateValue
}

const isNotBot = (matched: RegExpMatchArray) => !matched.groups.body.startsWith('[Bot] ')

const isNotTimeSignal = (matched: RegExpMatchArray) => !matched.groups.body.startsWith('[時報] ')

export const messageRE = />>\s「\s(?<body>[^」]+)\s」\(チャット放話\s-\s(?<date>\d\d\/\d\d)\s\((?<dow>[日月火水木金土])\)\s(?<time>\d\d:\d\d:\d\d)\sby\s(?<host>[^\s]+)(\s\((?<forgery>※\s贋作\sDNS\s逆引の疑い)\))?\s君(\s(?<self>〈＊あなた様＊〉))?\)\s<</g

const parseStringAsDecimalInteger = (value: string) => parseInt(value)

const sliceItems = <T>(items: T[], count: number, reverse: boolean) =>
  reverse
    ? items.reverse().slice(0, count).reverse()
    : items.slice(0, count)

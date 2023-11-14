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
  readonly #regexp = /^(バック)?ログ(\s+((?<command>--help)|(?<count>[1-9]\d*)?(\s?since\s?(?<since>[1-9]\d*))?(\s?until\s?(?<until>[1-9]\d*))?))?$/
  readonly #speechService: SpeechService

  async #execute(count: string | undefined, rawMessage: string, since: string | undefined, until: string | undefined): Promise<void> {
    const end = parseIntOr(since, '-')
    const start = parseIntOr(until, '+')
    const index = +(since === undefined) * 2 + +(until === undefined)
    const contents = [] as string[]
    const last = {} as ComposingContext
    const filter = except(rawMessage)
    for (const item of await this.query(`${start}`, `${end}`, 200))
      isRedisStreamItemLog(item)
        ? contents.push(...composeLogs(last, item, filter))
        : contents.push(...composeLogsFromSpeech(last, item))
    const { length } = contents
    console.log({ count, end, index, length, since, start, until })
    if (contents.length) {
      const c = Math.min(parseIntOr(count, 10), 30)
      await this.#speechService.create(sliceItems(contents, c, index === 1).join('\n'))
    }
    else
      await this.#proxyService.post(`[Bot] 指定された範囲に該当するログがありません, ${formatDateTimeRange(end, start)}`)
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
  if (!lines.at(0)?.startsWith('[Bot] ')) {
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

const except = (text: string) => (matched: RegExpMatchArray) => !(matched[0] === text)

const formatDateTimeRange = (from: number | string, to: number | string) => {
  const [since, until] = [from, to].map(v => new Date(v)).map(formatDateTimeToFullyQualifiedString)
  return `${since?.concat('から') ?? ''}${until?.concat('まで') ?? ''}`
}

const isNotBot = (matched: RegExpMatchArray) => !matched.groups.body.startsWith('[Bot] ')

const isNotTimeSignal = (matched: RegExpMatchArray) => !matched.groups.body.startsWith('[時報] ')

export const messageRE = />>\s「\s(?<body>[^」]+)\s」\(チャット放話\s-\s(?<date>\d\d\/\d\d)\s\((?<dow>[日月火水木金土])\)\s(?<time>\d\d:\d\d:\d\d)\sby\s(?<host>[^\s]+)(\s\((?<forgery>※\s贋作\sDNS\s逆引の疑い)\))?\s君(\s(?<self>〈＊あなた様＊〉))?\)\s<</g

const sliceItems = <T>(items: T[], count: number, reverse: boolean) =>
  reverse
    ? items.reverse().slice(0, count).reverse()
    : items.slice(0, count)

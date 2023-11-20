import {
  CommandService,
  DatabaseService,
  FilterFunction,
  Injectable,
  KoukokuProxyService,
  Log,
  LogOrSpeechWithTimestamp,
  RedisStreamItem,
  Speech,
  SpeechService,
  abbreviateHostName,
  formatDateTimeToFullyQualifiedString,
  isRedisStreamItemLog,
  isRedisStreamItemLogOrSpeech,
  parseIntOr,
  twoDigitString,
} from '..'

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
  readonly #keyForLog: string
  readonly #keyForTimestamp: string
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
    for (const { item } of await this.query(start, end))
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

  async #query(timestamps: Map<string, number>, count: number | undefined): Promise<LogOrSpeechWithTimestamp[]> {
    if (timestamps.size) {
      const sorted = [...timestamps.keys()].sort()
      const lower = sorted.at(0) ?? '-'
      const upper = sorted.at(-1) ?? '+'
      const items = await this.#db.xRevRange(this.#keyForLog, upper, lower, count)
      return items.filter(hasItemId(timestamps)).sort(descendingById(timestamps)).filter(isRedisStreamItemLogOrSpeech).map(combineItemAndTimestamp(timestamps))
    }
    else
      return []
  }

  constructor(
    db: DatabaseService,
    proxyService: KoukokuProxyService,
    speechService: SpeechService
  ) {
    const { REDIS_LOG_KEY, REDIS_TIMESTAMP_KEY } = process.env
    this.#db = db
    this.#keyForLog = REDIS_LOG_KEY ?? 'koukoku:log'
    this.#keyForTimestamp = REDIS_TIMESTAMP_KEY ?? 'koukoku:timestamp'
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

  prepend(log: Log, timestamp: number): Promise<RedisStreamItem<Log>>
  prepend(speech: Speech, timestamp: number | undefined): Promise<RedisStreamItem<Speech>>
  async prepend(message: Log | Speech, timestamp: number | undefined): Promise<unknown> {
    const id = await this.#db.xAdd(this.#keyForLog, message)
    await this.#db.zAdd(this.#keyForTimestamp, timestamp, id)
    return message
  }

  async query(max: number | '+', min: number | '-', count?: number): Promise<LogOrSpeechWithTimestamp[]> {
    const card = await this.#db.zCard(this.#keyForTimestamp)
    const index = 2 * +(max === '+') + +(min === '-')
    if (index === 3) {
      const items = await this.#db.xRevRange(this.#keyForLog, max as '+', min as '-', count)
      const range = await this.#db.zRangeWithScores(this.#keyForTimestamp, { max: card, min: 0 })
      const timestamps = new Map(range.map(convertRangeToTuple))
      return items.filter(hasItemId(timestamps)).sort(descendingById(timestamps)).filter(isRedisStreamItemLogOrSpeech).map(combineItemAndTimestamp(timestamps))
    }
    const zRange = [this.#db.zRangeByScoreWithScores, this.#db.zRangeWithScores, this.#db.zRangeWithScores, this.#db.zRangeWithScores]
    const source = await zRange[index].bind(this.#db)(
      this.#keyForTimestamp,
      {
        max: [max as number, card, card][index],
        min: [min as number, 0, 0][index],
      }
    )
    const range = index
      ? source.filter(
        [isLessThan(max as number), isGreaterThan(min as number)][index - 1]
      )
      : source
    const timestamps = new Map(range.map(convertRangeToTuple))
    return await this.#query(timestamps, count)
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

const combineItemAndTimestamp = (timestamps: Map<string, number>) => (item: RedisStreamItem<Log> | RedisStreamItem<Speech>) => {
  const timestamp = timestamps.get(item.id)
  return {
    item,
    timestamp
  }
}

function* composeLogs(last: ComposingContext, item: RedisStreamItem<Log>, ...filters: FilterFunction<RegExpMatchArray>[]) {
  const message = item.message.log.replaceAll(/\r?\n/g, '')
  const matches = [...message.matchAll(messageRE)]
  for (const matched of applyFilters(matches, isNotBot, isNotTimeSignal, ...filters)) {
    const current = {
      host: abbreviateHostName(matched.groups.host),
      message: matched.groups.body,
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

const convertRangeToTuple = (range: { score: number, value: string }) => {
  const { score, value } = range
  return [value, score] as [string, number]
}

const descendingById = (dict: Map<string, number>) => (lhs: { id: string }, rhs: { id: string }) => dict.get(rhs.id) - dict.get(lhs.id)

const except = (text: string) => (matched: RegExpMatchArray) => !(matched[0] === text)

const formatDateTimeRange = (from: number | '-', to: number | '+') => {
  const [since, until] = [from, to].map((value: number | '-' | '+') => new Date(value)).map(formatDateTimeToFullyQualifiedString)
  const value = +(since === undefined) * 2 + +(until === undefined)
  if (value < 3)
    return `${since?.concat('から') ?? ''}${until?.concat('まで') ?? ''}`
}

const hasItemId = (dict: Map<string, number>) => (item: { id: string }) => dict.has(item.id)

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

const isGreaterThan = <T extends { score: number }>(min: number) => (item: T) => min <= item.score

const isLessThan = <T extends { score: number }>(max: number) => (item: T) => item.score <= max

const isNotBot = (matched: RegExpMatchArray) => !matched.groups.body.startsWith('[Bot] ')

const isNotTimeSignal = (matched: RegExpMatchArray) => !matched.groups.body.startsWith('[時報] ')

export const messageRE = />>\s「\s(?<body>[^」]+(?=\s」))\s」\(チャット放話\s-\s(?<date>\d\d\/\d\d)\s\((?<dow>[日月火水木金土])\)\s(?<time>\d\d:\d\d:\d\d)\sby\s(?<host>[^\s]+)(\s\((?<forgery>※\s贋作\sDNS\s逆引の疑い)\))?\s君(\s(?<self>〈＊あなた様＊〉))?\)\s<</g

const parseStringAsDecimalInteger = (value: string) => parseInt(value)

const sliceItems = <T>(items: T[], count: number, reverse: boolean) =>
  reverse
    ? items.reverse().slice(0, count).reverse()
    : items.slice(0, count)

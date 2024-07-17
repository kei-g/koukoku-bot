import type {
  CommandService,
  Log,
} from '..'

import {
  Injectable,
  LogService,
  SpeechService,
  abbreviateHostName,
  formatDateTimeToFullyQualifiedString,
  isRedisStreamItemLog,
} from '..'

type TallyQualifier = {
  name: string
  week: number
}

@Injectable({
  DependsOn: [
    LogService,
    SpeechService,
  ]
})
export class TallyService implements CommandService {
  readonly #logService: LogService
  readonly #regexp = /^集計(\s(?<command>--help))?$/i
  readonly #speechService: SpeechService

  async #tally(list: string[], _matched: RegExpMatchArray): Promise<void> {
    const weekly = new Map<number, Map<string, Log[]>>()
    await this.#tallyByWeek(weekly)
    const weeks = [...weekly.keys()].sort(descending)
    const qualifiers: Readonly<TallyQualifier[]> = [
      {
        name: '今',
        week: weeks[0],
      },
      {
        name: '先',
        week: weeks[1],
      },
    ] as const
    for (const q of qualifiers) {
      const hosts = weekly.get(q.week)
      list.push(`${q.name}週のクライアント数は ${hosts.size} で、発言回数の多かったものは次の通りです`)
      list.push('')
      const sorted = [...hosts.entries()].sort(descendingByFrequency)
      for (const [host, chats] of sorted.slice(0, 5))
        list.push(`${abbreviateHostName(host)} ${chats.length} 回`)
      list.push('')
    }
    list.push('※クライアントは逆引きホスト名で区別しています。')
    list.push('※発言回数は Bot および時報を含みます。')
  }

  async #tallyByWeek(weekly: Map<number, Map<string, Log[]>>): Promise<void> {
    const now = new Date()
    const epoch = new Date(now.getFullYear(), 0, 1).getTime()
    for (const { id, message } of (await this.#logService.query('+', '-')).map(element => element.item).filter(isRedisStreamItemLog)) {
      const timestamp = new Date(parseInt(id.split('-')[0])).getTime()
      const numberOfDays = Math.floor((timestamp - epoch) / 864e5)
      const week = Math.ceil((now.getDay() + 1 + numberOfDays) / 7)
      const hosts = weekly.get(week) ?? new Map<string, Log[]>()
      const { host } = message
      const list = hosts.get(host) ?? []
      list.push(message)
      hosts.set(host, list)
      weekly.set(week, hosts)
    }
  }

  constructor(
    logService: LogService,
    speechService: SpeechService
  ) {
    this.#logService = logService
    this.#speechService = speechService
  }

  async execute(matched: RegExpMatchArray): Promise<void> {
    const { command } = matched.groups
    if (command) {
      const name = command.slice(2).toLowerCase()
      await this.#speechService.createFromFile(`templates/tally/${name}.txt`)
    }
    else {
      const list = [
        `[Bot] ${formatDateTimeToFullyQualifiedString(new Date())}時点の集計結果`,
        ''
      ]
      await this.#tally(list, matched)
      await this.#speechService.create(list.join('\n'))
    }
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

const descending = (lhs: number, rhs: number) => rhs - lhs

const descendingByFrequency = (lhs: [string, Log[]], rhs: [string, Log[]]) => rhs[1].length - lhs[1].length

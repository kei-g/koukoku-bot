import {
  Injectable,
  KoukokuProxyService,
  PeriodicSchedulerService,
  TelnetClientService,
  twoDigitString,
} from '..'

import type {
  Log,
  PeriodicSchedule,
  Service,
} from '..'

interface TimeSignal {
  hrtime: bigint
  time: Date
}

@Injectable({
  DependsOn: [
    KoukokuProxyService,
    PeriodicSchedulerService,
    TelnetClientService,
  ]
})
export class TimeSignalService implements Service {
  readonly #proxyService: KoukokuProxyService
  readonly #regexp = /^\[時報\](?<time>(\s\d+\s[年月日時分秒])+)です$/
  readonly #scheduleId: number
  readonly #schedulerService: PeriodicSchedulerService
  readonly #timeSignals = [] as TimeSignal[]

  async #message(log: Log, _rawMessage: string, _timestamp: number): Promise<void> {
    const hrtime = process.hrtime.bigint()
    const m = log.body.match(this.#regexp)
    if (m) {
      const time = new Date(m.groups.time.replaceAll(' ', ''))
      this.#timeSignals.unshift({ hrtime, time })
    }
  }

  async #minutely(schedule: PeriodicSchedule): Promise<void> {
    const signal = this.#timeSignals.at(0)
    if (!(schedule.time - schedule.delta - 65000000000n < signal?.hrtime)) { // unless within the latest 65seconds
      const now = new Date()
      const [month, date, hour, minute, second] = [
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      ].map(twoDigitString)
      await this.#proxyService.post(`[時報] ${now.getFullYear()} 年 ${month} 月 ${date} 日 ${hour} 時 ${minute} 分 ${second} 秒です (代理)`)
    }
  }

  constructor(
    proxyService: KoukokuProxyService,
    schedulerService: PeriodicSchedulerService,
    telnetService: TelnetClientService
  ) {
    this.#proxyService = proxyService
    this.#scheduleId = schedulerService.register(this.#minutely.bind(this), { minutes: [1] })
    this.#schedulerService = schedulerService
    telnetService.on('message', this.#message.bind(this))
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#schedulerService.unregister(this.#scheduleId)
  }
}

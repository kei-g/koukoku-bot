import type {
  Action,
  PeriodicPeriod,
  PeriodicSchedule,
  Service,
} from '..'

import {
  Injectable,
  PromiseList,
  sequentialNumbers,
  twoDigitString,
} from '..'

import { randomUUID } from 'crypto'

type PeriodicIndicator = PeriodicTime & {
  interval: number
}

type PeriodicObserver<T extends unknown[]> = {
  args: T
  callback: PeriodicObserverFunction<T>
  period: PeriodicPeriod
}

type PeriodicObserverFunction<T extends unknown[]> = (item: PeriodicSchedule, ...args: T) => unknown

type PeriodicTime = {
  delta: bigint
  hour: number
  minute: number
  time: bigint
}

const hrtime = process.hrtime.bigint

@Injectable()
export class PeriodicSchedulerService implements Service {
  readonly #bound: Action<PeriodicIndicator>
  readonly #observers = new Map<number, PeriodicObserver<unknown[]>>()
  readonly #timeouts = new WeakMap<this, NodeJS.Timeout>()

  #callMeAtNextPeriod(value: PeriodicIndicator | number): void {
    const timeout = callMeAtNextPeriod(this.#bound, value)
    this.#timeouts.set(this, timeout)
  }

  async #dispatch(item: PeriodicSchedule): Promise<void> {
    const { behind, hour, minute } = item
    const b = Number(behind) / 1e6
    const c = b < 0 ? [-b, 'ahead'] : [b, 'behind']
    console.log(`\x1b[4m${[hour, minute].map(twoDigitString).join(':')}\x1b[m \x1b[33m${c.join('\x1b[m(ms) ')}`)
    await using list = new PromiseList()
    for await (const observer of this.#observers.values()) {
      const { hours, minutes } = observer.period
      if (hours.includes(hour) && minutes.includes(minute))
        list.push(observer.callback(item, ...observer.args))
    }
  }

  #generateNewId(): number {
    for (; ;) {
      const uuid = Buffer.from(randomUUID().replaceAll('-', ''), 'hex')
      for (let offset = 0; offset < uuid.byteLength; offset += 4) {
        const id = uuid.readUInt32LE(offset)
        if (!this.#observers.has(id))
          return id
      }
    }
  }

  #minutely(indicator: PeriodicIndicator): void {
    const now = hrtime()
    const { delta, hour, minute, time } = indicator
    const behind = now - (time - indicator.delta)
    const item = { behind, delta, hour, minute, time }
    this.#callMeAtNextPeriod(indicator)
    queueMicrotask(this.#dispatch.bind(this, item))
  }

  constructor() {
    this.#bound = this.#minutely.bind(this)
  }

  register<T extends unknown[]>(cb: PeriodicObserverFunction<T>, period?: PeriodicPeriod, ...args: T): number {
    const id = this.#generateNewId()
    const callback = cb as unknown as PeriodicObserverFunction<unknown[]>
    const observer = {
      args,
      callback,
      period: {
        hours: period?.hours ?? sequentialNumbers(24),
        minutes: period?.minutes ?? (period?.hours ? [0] : sequentialNumbers(60)),
      },
    }
    this.#observers.set(id, observer)
    return id
  }

  async start(): Promise<void> {
    this.#callMeAtNextPeriod(Date.now())
  }

  unregister(id: number): void {
    this.#observers.delete(id)
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const timeout = this.#timeouts.get(this)
    if (timeout)
      clearTimeout(timeout)
    this.#observers.clear()
  }
}

const callMeAtNextPeriod = (cb: Action<PeriodicIndicator>, value: PeriodicIndicator | number): NodeJS.Timeout => {
  const next = nextPeriodicIndicatorFrom(value)
  return setTimeout(cb, next.interval, next)
}

const compareWithHRTime = (value: number): bigint => {
  const now = hrtime()
  return BigInt(value * 1e6) - now
}

const nextPeriodicIndicatorFrom = (value: PeriodicIndicator | number): PeriodicIndicator => {
  const next = nextPeriodicTimeFor(value) as PeriodicIndicator
  next.interval = Number((next.time - next.delta) - hrtime()) / 1e6
  return next
}

const nextPeriodicTimeFor = (value: PeriodicIndicator | number): PeriodicTime => {
  if (typeof value === 'number') {
    const date = new Date(value)
    const hour = date.getHours()
    const delta = compareWithHRTime(value)
    const currentSecond = Math.trunc((value - (value % 1e3)) / 1e3)
    const currentMinute = Math.trunc((currentSecond - (currentSecond % 60)) / 60)
    const nextMinute = currentMinute + 1
    const minute = nextMinute % 60
    const time = BigInt(nextMinute * 6e10)
    return {
      delta,
      hour: (hour + +(minute === 0)) % 24,
      minute,
      time,
    }
  }
  const d = compareWithHRTime(Date.now())
  const { delta: e, hour, minute, time } = value
  const delta = (d + e) >> 1n
  return {
    delta,
    hour: (hour + +(minute === 59)) % 24,
    minute: (minute + 1) % 60,
    time: time + 60000000000n
  }
}

import { PeriodicPeriod, PeriodicSchedule } from '..'
import { randomUUID } from 'crypto'

type MinuteIndicator = MinuteTime & {
  interval: number
}

type MinuteTime = {
  delta: bigint
  minute: number
  time: bigint
}

type PeriodicObserver<T extends unknown[]> = {
  args: T
  callback: PeriodicObserverFunction<T>
  period: PeriodicPeriod
}

type PeriodicObserverFunction<T extends unknown[]> = (item: PeriodicSchedule, ...args: T) => unknown

const hrtime = process.hrtime.bigint

export class PeriodicScheduler implements Disposable {
  readonly #bound: (next: MinuteIndicator) => void
  #id: NodeJS.Timeout
  readonly #observers = new Map<number, PeriodicObserver<unknown[]>>()

  async #dispatch(item: PeriodicSchedule): Promise<void> {
    const selector = [isMinutely, alwaysTrue][+item.isHourly]
    console.log(item)
    for await (const observer of this.#observers.values())
      if (selector(observer))
        await observer.callback(item, ...observer.args)
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

  #minutely(indicator: MinuteIndicator): void {
    const now = hrtime()
    const { delta, minute, time } = indicator
    const behind = now - (time - indicator.delta)
    const isHourly = minute === 0
    const item = { behind, delta, isHourly, minute, time }
    this.#id = callMeAtNextMinute(this.#bound, indicator)
    queueMicrotask(this.#dispatch.bind(this, item))
  }

  constructor() {
    this.#bound = this.#minutely.bind(this)
    this.#id = callMeAtNextMinute(this.#bound, Date.now())
  }

  register<T extends unknown[]>(cb: PeriodicObserverFunction<T>, period: PeriodicPeriod, ...args: T): number {
    const id = this.#generateNewId()
    const callback = cb as unknown as PeriodicObserverFunction<unknown[]>
    this.#observers.set(id, { args, callback, period })
    return id
  }

  unregister(id: number): void {
    this.#observers.delete(id)
  }

  [Symbol.dispose](): void {
    clearTimeout(this.#id)
    this.#observers.clear()
  }
}

const alwaysTrue = <T extends unknown[]>(_element: PeriodicObserver<T>): boolean => true

const callMeAtNextMinute = (cb: (next: MinuteIndicator) => void, value: MinuteIndicator | number): NodeJS.Timeout => {
  const next = nextMinuteIndicatorFrom(value)
  return setTimeout(cb, next.interval, next)
}

const compareWithHighResolutionTime = (value: number): bigint => {
  const now = hrtime()
  return BigInt(value * 1e6) - now
}

const isMinutely = <T extends unknown[]>(element: PeriodicObserver<T>): boolean => element.period === 'minutely'

const nextMinuteIndicatorFrom = (value: MinuteIndicator | number): MinuteIndicator => {
  const next = nextMinuteTimeFor(value) as MinuteIndicator
  next.interval = Number((next.time - next.delta) - hrtime()) / 1e6
  return next
}

const nextMinuteTimeFor = (value: MinuteIndicator | number): MinuteTime => {
  if (typeof value === 'number') {
    const delta = compareWithHighResolutionTime(value)
    const currentSecond = Math.trunc((value - (value % 1e3)) / 1e3)
    const currentMinute = Math.trunc((currentSecond - (currentSecond % 60)) / 60)
    const nextMinute = currentMinute + 1
    const minute = nextMinute % 60
    const time = BigInt(nextMinute * 6e10)
    return {
      delta,
      minute,
      time,
    }
  }
  const d = compareWithHighResolutionTime(Date.now())
  const { delta: e, minute, time } = value
  const delta = (d + e) >> 1n
  return {
    delta,
    minute: (minute + 1) % 60,
    time: time + 60000000000n
  }
}

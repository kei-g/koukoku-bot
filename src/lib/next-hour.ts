import { EventEmitter } from 'events'

export class NextHour extends EventEmitter {
  private id?: NodeJS.Timeout

  constructor() {
    super()
  }

  get intervalToNextHour(): number {
    return this.nextHour.getTime() - Date.now()
  }

  get nextHour(): Date {
    const now = Date.now()
    const currentSecond = (now - (now % 1000)) / 1000
    const currentMinute = (currentSecond - (currentSecond % 60)) / 60
    const currentHour = (currentMinute - (currentMinute % 60)) / 60
    return new Date((currentHour + 1) * 3600 * 1000)
  }

  start(): void {
    this.stop()
    this.id = setTimeout(this.emit.bind(this, 'timeout'), this.intervalToNextHour)
  }

  stop(): void {
    if (this.id === undefined)
      return
    const { id } = this
    delete this.id
    clearTimeout(id)
  }
}

import {
  Injectable,
  PeriodicSchedulerService,
  SpeechService,
  formatDateTimeToFullyQualifiedString,
} from '..'

import type {
  PeriodicSchedule,
  Service,
} from '..'

import { readFile } from 'fs/promises'

@Injectable({
  DependsOn: [
    PeriodicSchedulerService,
    SpeechService,
  ]
})
export class IntroductionService implements Service {
  readonly #scheduleId: number
  readonly #schedulerService: PeriodicSchedulerService
  readonly #speechService: SpeechService
  readonly #template = new WeakMap<this, string>()

  async #minutely(schedule: PeriodicSchedule): Promise<void> {
    const date = new Date(Number(schedule.time / 1000000n))
    const template = this.#template.get(this)
    const content = template.replaceAll(/\$\{now\}/g, formatDateTimeToFullyQualifiedString(date))
    await this.#speechService.create(content)
  }

  constructor(
    schedulerService: PeriodicSchedulerService,
    speechService: SpeechService
  ) {
    this.#scheduleId = schedulerService.register(
      this.#minutely.bind(this),
      {
        hours: [12, 21],
        minutes: [34],
      }
    )
    this.#schedulerService = schedulerService
    this.#speechService = speechService
  }

  async start(): Promise<void> {
    const data = await readFile('templates/introduction/periodic.txt')
    const template = data.toString().trim()
    this.#template.set(this, template)
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#schedulerService.unregister(this.#scheduleId)
  }
}

import type {
  CommandService,
} from '..'

import {
  Injectable,
  SpeechService,
} from '..'

@Injectable({
  DependsOn: [
    SpeechService,
  ]
})
export class HelpService implements CommandService {
  readonly #regexp = /^(?<command>コマンド(リスト)?|ヘルプ)$/
  readonly #speechService: SpeechService

  constructor(
    speechService: SpeechService
  ) {
    this.#speechService = speechService
  }

  async execute(_matched: RegExpMatchArray): Promise<void> {
    await this.#speechService.createFromFile('templates/help.txt')
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

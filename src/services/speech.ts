import {
  Injectable,
  KoukokuProxyService,
} from '..'

import type {
  KoukokuProxyPutResponse,
  Service,
} from '..'

import { readFile } from 'fs/promises'

@Injectable({
  DependsOn: [
    KoukokuProxyService,
  ]
})
export class SpeechService implements Service {
  readonly #proxyService: KoukokuProxyService

  constructor(
    proxyService: KoukokuProxyService
  ) {
    this.#proxyService = proxyService
  }

  async create(content: string, maxLength: number = 64, remark: boolean = true): Promise<Error | KoukokuProxyPutResponse> {
    const response = await this.#proxyService.post(content, maxLength, remark)
    if (response instanceof Error) {
      console.log(`content: \x1b[32m${content}\x1b[m, error: \x1b[31m${response.message}\x1b[m, maxLength: \x1b[33m${maxLength}\x1b[m`)
      console.dir({ stacktrace: response.stack }, { colors: true, depth: 1, maxArrayLength: null })
      //await this.#proxyService.post('[Bot] 大演説の生成に失敗しました')
    }
    return response
  }

  async createFromFile(path: string): Promise<Error | KoukokuProxyPutResponse> {
    const response = {} as { value: Error | KoukokuProxyPutResponse }
    const data = await readFile(path).catch(
      (reason: Error) => response.value = reason
    )
    if (data) {
      const text = data.toString().trim()
      const time = Date.now().toString(16).slice(2, -2)
      response.value = await this.create(`[Bot@${time}] https://github.com/kei-g/koukoku-bot\n\n${text}`)
    }
    return response.value
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

import type {
  Action,
  CommandService,
} from '..'

import {
  DeepLService,
  Injectable,
  KoukokuProxyService,
  isDeepLSuccess,
  isErrorLike,
} from '..'

import { ChildProcess, SpawnOptionsWithoutStdio, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { Stats, stat } from 'fs'
import { join as joinPath } from 'path'
import { readFile } from 'fs/promises'

@Injectable({
  DependsOn: [
    KoukokuProxyService,
    DeepLService,
  ]
})
export class PhiLLMService implements CommandService {
  readonly #childProcess = new WeakMap<this, ChildProcess>()
  readonly #eventEmitter = new EventEmitter()
  readonly #proxyService: KoukokuProxyService
  readonly #regexp = /^対話\s(?<body>.+)$/
  readonly #status = {} as { generating?: true, ready?: true }
  readonly #translator: DeepLService

  #extractAnswerPart(_error: Error): Error
  #extractAnswerPart(_text: string): string
  #extractAnswerPart(value: Error | string): Error | string {
    if (typeof value === 'string') {
      const answer = value.match(/^(?<=Answer: )[\S\s]+/)
      if (answer) {
        const exercise = answer[0].match(/^Exercise \d+: /)
        return answer[0].slice(0, exercise?.index)
      }
    }
    return value ?? new Error('internal mismatch')
  }

  async #generate(message: string): Promise<Error | string> {
    const data = Buffer.from(message.replaceAll(/\r?\n/g, '').trim() + '\n')
    const { generating } = this.#status
    let result: Error | string
    if (!generating) {
      this.#status.generating = true
      const childProcess = this.#childProcess.get(this)
      result = await new Promise(
        (resolve: Action<Error>) => childProcess.stdin.write(data, resolve)
      )
      if (!result)
        result = this.#extractAnswerPart(await this.#waitForData())
      delete this.#status.generating
    }
    return result ?? new Error('busy')
  }

  async #spawn(script: string): Promise<void> {
    const { env } = process
    const spawnOptions = {
      env: structuredClone(env),
      shell: false,
    } as SpawnOptionsWithoutStdio
    const { PHI_MAX_LENGTH, SUDO_GID, SUDO_UID } = env
    spawnOptions.env.PHI_MAX_LENGTH = (PHI_MAX_LENGTH ?? '50')
    if (SUDO_GID)
      spawnOptions.gid = parseInt(SUDO_GID)
    if (SUDO_UID)
      spawnOptions.uid = parseInt(SUDO_UID)
    const python3 = await this.#whereIs('python3')
    const childProcess = spawn(
      env.SHELL,
      [
        '-c',
        `${python3} -c '${script}'`,
      ],
      spawnOptions
    )
    this.#childProcess.set(this, childProcess)
    childProcess.stderr.on(
      'data',
      (chunk: unknown) => console.error(`[phi-1.5] \x1b[31m${(chunk as Buffer).toString()}\x1b[m`)
    )
    childProcess.stdout.on(
      'data',
      (chunk: unknown) => this.#eventEmitter.emit(
        'data',
        chunk.toString().trim()
      )
    )
  }

  #waitForData(): Promise<string> {
    return new Promise(
      (resolve: Action<string>) => this.#eventEmitter.once('data', resolve)
    )
  }

  async #whereIs(name: string): Promise<string> {
    for (const prefix of process.env.PATH.split(':')) {
      const path = joinPath(prefix, name)
      const maybeError = await statAsync(path)
      if (!(maybeError instanceof Error))
        return path
    }
    await Promise.reject(new Error(`${name} is not found`))
  }

  constructor(
    proxyService: KoukokuProxyService,
    translator: DeepLService
  ) {
    this.#proxyService = proxyService
    this.#translator = translator
  }

  async execute(matched: RegExpMatchArray): Promise<void> {
    const { body } = matched.groups
    let r = await this.#translator.translate(body, 'EN')
    if (isDeepLSuccess(r)) {
      const response = await this.#generate(r.translations[0].text)
      if (response instanceof Error)
        await this.#proxyService.post(`[Bot] 対話中にエラーが発生しました, ${response.message}`)
      else {
        r = await this.#translator.translate(response, 'JA')
        if (isDeepLSuccess(r))
          await this.#proxyService.post(`[Bot] ${r.translations[0].text.replaceAll(/\r?\n/g, '')}`)
      }
    }
    if (isErrorLike(r))
      await this.#translator.complain(r)
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  async start(): Promise<void> {
    const data = await readFile('phi.py')
    const script = data.toString()
    await this.#spawn(script)
    const prompt = await this.#waitForData()
    console.log(`[phi-1.5] \x1b[32m${prompt}\x1b[m`)
    this.#status.ready = true
  }

  async[Symbol.asyncDispose](): Promise<void> {
    const childProcess = this.#childProcess.get(this)
    if (this.#status.generating || !this.#status.ready)
      childProcess.kill('SIGINT')
    else
      childProcess.stdin.end()
  }
}

const statAsync = (path: string) => new Promise(
  (resolve: Action<NodeJS.ErrnoException | Stats>) => stat(
    path,
    {},
    (error: NodeJS.ErrnoException, stats: Stats) => resolve(error ?? stats)
  )
)

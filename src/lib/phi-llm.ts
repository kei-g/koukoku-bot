import { Action } from '..'
import { ChildProcess, SpawnOptionsWithoutStdio, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { readFile } from 'fs/promises'

export namespace PhiLLM {
  export class Dialogue implements Disposable {
    static async create(options?: DialogueOptions): Promise<Dialogue> {
      const data = await readFile('phi.py')
      const script = data.toString()
      const dialogue = new Dialogue(script, options)
      const prompt = await dialogue.#waitForDataAsync()
      console.log(`[phi-1.5] \x1b[32m${prompt}\x1b[m`)
      return dialogue
    }

    readonly #childProcess: ChildProcess
    readonly #eventEmitter = new EventEmitter()
    readonly #status = {} as { generating?: true }

    #extractAnswerPart(error: Error): Error
    #extractAnswerPart(text: string): string
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

    #waitForDataAsync(): Promise<string> {
      return new Promise(
        (resolve: Action<string>) => this.#eventEmitter.once('data', resolve)
      )
    }

    private constructor(script: string, options?: DialogueOptions) {
      const { env, stderr } = process
      const spawnOptions = {
        env: structuredClone(env),
        shell: false,
      } as SpawnOptionsWithoutStdio
      const { SUDO_GID, SUDO_UID } = env
      if (SUDO_GID)
        spawnOptions.gid = parseInt(SUDO_GID)
      if (SUDO_UID)
        spawnOptions.uid = parseInt(SUDO_UID)
      spawnOptions.env.PHI_MAX_LENGTH = (options?.maxLength ?? 50).toString()
      this.#childProcess = spawn(
        env.SHELL,
        [
          '-c',
          `/usr/bin/python3 -c '${script}'`,
        ],
        spawnOptions
      )
      this.#childProcess.stderr.on(
        'data',
        (chunk: unknown) => stderr.write(`[phi-1.5] \x1b[31m${(chunk as Buffer).toString()}\x1b[m`)
      )
      this.#childProcess.stdout.on(
        'data',
        (chunk: unknown) => this.#eventEmitter.emit(
          'data',
          chunk.toString().trim()
        )
      )
    }

    async speakAsync(message: string): Promise<Error | string> {
      const data = Buffer.from(message.replaceAll(/\r?\n/g, '').trim() + '\n')
      const { generating } = this.#status
      let result: Error | string
      if (!generating) {
        this.#status.generating = true
        result = await new Promise(
          (resolve: Action<Error>) => this.#childProcess.stdin.write(data, resolve)
        )
        if (!result)
          result = this.#extractAnswerPart(await this.#waitForDataAsync())
        delete this.#status.generating
      }
      return result ?? new Error('busy')
    }

    [Symbol.dispose](): void {
      if (this.#status.generating)
        this.#childProcess.kill('SIGINT')
      else
        this.#childProcess.stdin.end()
    }
  }

  type DialogueOptions = {
    maxLength?: number
  }
}

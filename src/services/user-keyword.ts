import {
  AsyncAction,
  CommandService,
  DatabaseService,
  IgnorePattern,
  Injectable,
  KoukokuProxyService,
  SpeechService,
  compileIgnorePattern,
  isIgnorePattern,
  isKoukokuProxyPutResponse,
  shouldBeIgnored,
} from '..'
import { readFile } from 'fs/promises'

type IgnorePatterns = {
  ignorePatterns: IgnorePattern[]
}

@Injectable({
  DependsOn: [
    DatabaseService,
    KoukokuProxyService,
    SpeechService,
  ]
})
export class UserKeywordService implements CommandService {
  readonly #db: DatabaseService
  readonly #ignorePatterns = [] as IgnorePattern[]
  readonly #key: string
  readonly #keywords = new Set<string>()
  readonly #proxyService: KoukokuProxyService
  readonly #regexp = /^キーワード(?<command>一覧|登録|解除)?(\s(?<name>(--help|[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}\w]{1,8})))?(\s(?<value>[\p{scx=Common}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}\s\w\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+))?$/u
  readonly #speechService: SpeechService

  async #createSpeech(command: string, keywords: Map<string, string>): Promise<void> {
    const now = new Date()
    const list = [] as string[]
    const date = now.toLocaleDateString(
      'ja-JP-u-ca-japanese',
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }
    )
    const time = now.toLocaleTimeString().split(':')
    time.push('時', time.splice(1).join('分'), '秒')
    list.push(`${date}${time.join('')}時点で登録されているキーワードの一覧は以下の通りです`)
    list.push('')
    for (const e of keywords)
      list.push(e.join(' => '))
    if (list.length <= 30)
      await this.#speechService.create(list.join('\n'))
    else {
      const speech = await this.#speechService.create(list.join('\n'), 7, false)
      if (isKoukokuProxyPutResponse(speech)) {
        const { expiresAt, url } = speech
        await this.#proxyService.post(`[Bot] キーワード${command}を${url}に置きました, 期限:${expiresAt}`)
      }
    }
  }

  async #describeUserKeyword(_matched: RegExpMatchArray): Promise<void> {
    await this.#speechService.createFromFile('templates/keyword/help.txt')
  }

  async #listUserKeywords(matched: RegExpMatchArray): Promise<void> {
    const { command, name, value } = matched.groups
    if (name || value)
      await this.#proxyService.post(`[Bot] キーワード${command}の構文が正しくありません`)
    else {
      const keywords = createMap(await this.#db.hGetAll(this.#key))
      await (
        keywords.size === 0
          ? this.#proxyService.post('[Bot] キーワードは登録されていません')
          : this.#createSpeech(command, keywords)
      )
    }
  }

  async #loadIgnorePatterns(): Promise<void> {
    const data = await readFile('conf/ignore.json')
    const { ignorePatterns } = JSON.parse(data.toString()) as IgnorePatterns
    for (const pattern of ignorePatterns.map(compileIgnorePattern).filter(isIgnorePattern))
      this.#ignorePatterns.push(pattern)
  }

  async #loadKeywords(): Promise<void> {
    const keywords = await this.#db.hKeys(this.#key)
    keywords.forEach(this.#keywords.add.bind(this.#keywords))
  }

  async #registerUserKeyword(matched: RegExpMatchArray): Promise<void> {
    const { command, name, value } = matched.groups
    const text = '[Bot] キーワード' + ((name && value) ? (` "${name}" ` + ['は既に登録されています', 'を登録しました'][+(await this.#db.hSetNX(this.#key, name, value))]) : `${command}の構文が正しくありません`)
    if (text.endsWith('を登録しました'))
      this.#keywords.add(name)
    await this.#proxyService.post(text)
  }

  async #unregisterUserKeyword(matched: RegExpMatchArray): Promise<void> {
    const { command, name, value } = matched.groups
    const text = '[Bot] キーワード' + ((name && !value) ? (` "${name}" ` + ['は未登録です', 'を登録解除しました'][+(await this.#db.hDel(this.#key, name))]) : `${command}の構文が正しくありません`)
    if (text.endsWith('を登録解除しました'))
      this.#keywords.delete(name)
    await this.#proxyService.post(text)
  }

  constructor(
    db: DatabaseService,
    proxyService: KoukokuProxyService,
    speechService: SpeechService
  ) {
    this.#db = db
    this.#key = process.env.REDIS_USERKEYWORD_KEY ?? 'koukoku:keywords'
    this.#proxyService = proxyService
    this.#speechService = speechService
  }

  async execute(matched: RegExpMatchArray): Promise<void> {
    const handlers = {
      '--help': this.#describeUserKeyword,
      '一覧': this.#listUserKeywords,
      '登録': this.#registerUserKeyword,
      '解除': this.#unregisterUserKeyword,
    } as Record<string, AsyncAction<RegExpMatchArray>>
    const { command, name, value } = matched.groups
    console.log({ command, name, value })
    const u = +(command !== undefined && (command in handlers))
    const v = +(command === undefined && name !== undefined)
    console.log({ u, v })
    const key = [null, name, command, null][u * 2 + v]
    if (key in handlers) {
      const handler = handlers[key]
      await handler.bind(this)(matched)
    }
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  async start(): Promise<void> {
    await Promise.all(
      [
        this.#loadIgnorePatterns(),
        this.#loadKeywords(),
      ]
    )
  }

  async test(matched: RegExpMatchArray): Promise<void> {
    if (!shouldBeIgnored(matched, this.#ignorePatterns)) {
      const { body } = matched.groups
      const keywords = [...this.#keywords].filter((keyword: string) => body.includes(keyword))
      if (keywords.length)
        for (const value of await this.#db.hmGet(this.#key, ...keywords))
          await this.#proxyService.post(`[Bot] ${value}`)
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

const createMap = (obj: Record<string, string>) => {
  const map = new Map<string, string>()
  for (const key in obj) {
    const value = obj[key]
    map.set(key, value)
  }
  return map
}

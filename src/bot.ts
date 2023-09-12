import * as redis from '@redis/client'
import * as tls from 'tls'
import { BotInterface, DeepL, GitHub, KoukokuServer, Log, Speech, Unicode, Web, isDeepLError, isGitHubResponse, selectBodyOfLog } from '.'
import { RedisCommandArgument } from '@redis/client/dist/lib/commands'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { readFile } from 'fs'

export class Bot implements AsyncDisposable, BotInterface {
  private static readonly EscapesRE = /(\x07|\x1b\[\d+m|\xef\xbb\xbf)/g
  private static readonly LogRE = />>\s+「\s+(バック)?ログ(\s+((?<command>--help)|(?<count>[1-9]\d*)))?\s+」/
  private static readonly MessageRE = />>\s「\s(?<msg>[^」]+)」\(チャット放話\s-\s(?<date>\d{2}\/\d{2}\s\([^)]+\))\s(?<time>\d{2}:\d{2}:\d{2})\sby\s(?<host>[^\s]+)\s君\)\s<</g
  private static readonly TranslateRE = />>\s+「\s+翻訳\s+((?<command>--(help|lang))|((?<lang>bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh|bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh)\s+)?(?<text>[^」]+))/i

  private static get LogKey(): string {
    return process.env.REDIS_LOG_KEY ?? 'koukoku'
  }

  private readonly _bound: (data: Buffer) => void
  private readonly client: tls.TLSSocket
  private readonly db: redis.RedisClientType
  private readonly lang = new DeepL.LanguageMap()
  private readonly pending = [] as Buffer[]
  private readonly recent = { list: [] as Log[], map: new Map<string, Log>(), set: new Set<string>() }
  private readonly speechesSet = new Set<Speech>()
  private readonly web: Web

  constructor(server: KoukokuServer, private readonly threshold: number = 70) {
    this._bound = this.postponeKoukoku.bind(this)
    const port = server.port ?? 992
    const serverName = server.name ?? 'koukoku.shadan.open.ad.jp'
    const opts = { rejectUnauthorized: server.rejectUnauthorized }
    this.client = tls.connect(port, serverName, opts, this.send.bind(this, 'nobody'))
    this.client.on('data', this._bound)
    this.client.setKeepAlive(true)
    this.client.setNoDelay(false)
    this.db = redis.createClient({ pingInterval: 15000, url: process.env.REDIS_URL })
    this.web = new Web(this)
  }

  private async acceptKoukoku(data: Buffer): Promise<void> {
    if (this.threshold < data.byteLength) {
      const text = data.toString().replaceAll(Bot.EscapesRE, '').replaceAll(/\r?\n/g, '')
      const log = await this.appendLogAsync(text.replaceAll(' 〈＊あなた様＊〉', ''))
      this.web.broadcast(log)
      if (!text.includes(' 〈＊あなた様＊〉')) {
        const patterns = [
          { e: Bot.LogRE, f: this.locateLogsAsync.bind(this) },
          { e: Bot.TranslateRE, f: this.translateOrDescribeAsync.bind(this) },
        ]
        for (const a of patterns) {
          const matched = text.match(a.e)
          if (matched)
            await a.f(matched)
        }
      }
    }
  }

  private async appendLogAsync(text: string): Promise<Log> {
    const log = text.replaceAll(Bot.EscapesRE, '').replaceAll('\r\n', '\n').replaceAll('\n', '').trim()
    if (this.threshold < log.length && !this.recent.set.has(log)) {
      const message = { log }
      const id = await this.db.xAdd(Bot.LogKey, '*', message)
      const obj = { id, message }
      this.recent.list.unshift(obj)
      this.recent.map.set(id, obj)
      this.recent.set.add(log)
      return obj
    }
  }

  async createSpeechAsync(text: string): Promise<void> {
    const now = new Date()
    const salt = Buffer.from(now.toISOString(), 'ascii')
    const sha256 = createHash('sha256')
    sha256.update(salt)
    sha256.update(text)
    const hash = sha256.digest().toString('hex')
    const response = await GitHub.uploadToGistAsync(hash, text)
    if (isGitHubResponse(response)) {
      const { id, rawUrl } = response
      const speech = {
        content: text,
        expiresAt: new Date(now.getTime() + 300000),
        id,
        url: rawUrl,
      }
      this.speechesSet.add(speech)
      this.send(rawUrl)
    }
    else
      this.send('[Bot] 大演説の生成に失敗しました')
  }

  private async createSpeechFromFileAsync(path: string): Promise<void> {
    const data = await promisify(readFile)(path)
    const text = data.toString().trim()
    const time = Date.now().toString(16).slice(2, -2)
    await this.createSpeechAsync(`[Bot@${time}] https://github.com/kei-g/koukoku-bot\n\n${text}`)
  }

  private async describeLogAsync(match: RegExpMatchArray): Promise<void> {
    const name = match.groups.command.slice(2).toLowerCase()
    await this.createSpeechFromFileAsync(`templates/log/${name}.txt`)
  }

  private async describeTranslation(match: RegExpMatchArray): Promise<void> {
    const name = match.groups.command.slice(2).toLowerCase()
    await this.createSpeechFromFileAsync(`templates/translation/${name}.txt`)
  }

  get length(): Promise<number> {
    return this.db.xLen(Bot.LogKey)
  }

  private async locateLogsAsync(matched: RegExpMatchArray): Promise<void> {
    const { command, count } = matched.groups
    if (command)
      return await this.describeLogAsync(matched)
    const contents = [] as string[]
    for (const line of this.recent.list.map(selectBodyOfLog))
      for (const m of line.matchAll(Bot.MessageRE)) {
        const text = `${m.groups.host.replaceAll(/(\*+[-.]?)+/g, '*.')}:${m.groups.msg}@${m.groups.time}`
        contents.push(text)
      }
    await this.createSpeechAsync(contents.slice(0, Math.min(parseIntOr(count, 50), 50)).join('\n'))
  }

  notifyWebClient(send: (data: Log[]) => void): void {
    send(this.recent.list)
  }

  post(buffers: Buffer[], resolve: () => void): void {
    const data = Buffer.concat(buffers).toString()
    const json = JSON.parse(data) as unknown as { msg: string, token: string }
    if (json?.token === process.env.TOKEN)
      this.send(json?.msg?.trim())
    resolve()
  }

  private postponeKoukoku(data: Buffer): void {
    if (this.threshold < data.byteLength)
      this.pending.push(data)
  }

  async queryAsync(start: RedisCommandArgument, end: RedisCommandArgument, options?: { COUNT?: number }): Promise<Log[]> {
    if (50 < options?.COUNT)
      options.COUNT = 50
    const list = (await this.db.xRevRange(Bot.LogKey, start, end, options)).reverse() as unknown as Log[]
    list.forEach(this.updateRecent.bind(this))
    this.recent.list.sort((lhs: Log, rhs: Log) => [-1, 1][+(lhs.id < rhs.id)])
    return list
  }

  private send(text: string): void {
    const line = text + '\n'
    process.stdout.write(line)
    this.client.write(line)
  }

  get speeches(): Speech[] {
    return [...this.speechesSet]
  }

  async startAsync(): Promise<void> {
    await Promise.all(
      [
        this.db.connect(),
        this.queryAsync('+', '-', { COUNT: 100 }),
        this.web.loadAssetsAsync(),
      ]
    )
    this.client.off('data', this._bound)
    const store = this.acceptKoukoku.bind(this)
    this.pending.splice(0).forEach(store)
    this.client.on('data', store)
  }

  private async translateAsync(match: RegExpMatchArray): Promise<void> {
    const { lang, text } = match.groups
    const to = this.lang.getName(lang)?.concat('に') ?? ''
    const r = await DeepL.translateAsync(text, lang)
    if (isDeepLError(r))
      this.send(`[Bot] 翻訳エラー, ${r.message}`)
    else
      for (const t of r.translations) {
        const name = this.lang.getName(t.detected_source_language)
        const escaped = Unicode.escape(t.text.replaceAll(/\r?\n/g, '').trim())
        this.send(`[${name}から${to}翻訳] ${escaped}`)
      }
  }

  private async translateOrDescribeAsync(match: RegExpMatchArray): Promise<void> {
    (match.groups.command ? this.describeTranslation : this.translateAsync).bind(this)(match)
  }

  private updateRecent(log: Log): void {
    if (!this.recent.set.has(log.message.log)) {
      const index = this.recent.list.findIndex((value: Log) => value.id < log.id)
      const rhs = this.recent.list.splice(index)
      this.recent.list.push(log)
      if (rhs.length)
        this.recent.list.push(...rhs)
      this.recent.map.set(log.id, log)
      this.recent.set.add(log.message.log)
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    console.log('disposing bot...')
    console.log('disposing web...')
    this.web[Symbol.dispose]()
    console.log('deleting gists...')
    await Promise.all([...this.speechesSet].map(selectIdOfSpeech).map(GitHub.deleteGistAsync))
    console.log('disconnecting from database...')
    await this.db.disconnect()
    console.log('disconnecting from telnet server...')
    this.client.end()
    console.log('done')
  }
}

const parseIntOr = (text: string, defaultValue: number, radix?: number) => {
  const c = parseInt(text, radix)
  return isNaN(c) ? defaultValue : c
}

const selectIdOfSpeech = (speech: Speech) => speech.id

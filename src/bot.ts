import * as redis from '@redis/client'
import * as tls from 'tls'
import { BackLog, BotInterface, DeepL, KoukokuServer, Web, isDeepLError } from '.'
import { RedisCommandArgument } from '@redis/client/dist/lib/commands'

export class Bot implements AsyncDisposable, BotInterface {
  private static readonly BackLogRE = />>\s+「\s+(バック)?ログ(\s+(?<count>[1-9]\d*))?\s+」/
  private static readonly EscapesRE = /(\x07|\x1b\[\d+m|\xef\xbb\xbf)/g
  private static readonly TranslateRE = />>\s+「\s+翻訳\s+(?<text>[^」]+)/

  private static get LogKey(): string {
    return process.env.REDIS_LOG_KEY ?? 'koukoku'
  }

  private readonly _bound: (data: Buffer) => void
  private readonly client: tls.TLSSocket
  private readonly db: redis.RedisClientType
  private readonly pending = new Array<Buffer>()
  private readonly recent = { list: new Array<BackLog>(), map: new Map<string, BackLog>() }
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
      if (!text.includes(' 〈＊あなた様＊〉')) {
        const patterns = [
          { e: Bot.BackLogRE, f: this.locateBacklogsAsync.bind(this) },
          { e: Bot.TranslateRE, f: this.translateAsync.bind(this) },
        ]
        for (const a of patterns) {
          const matched = text.match(a.e)
          if (matched)
            return await a.f(matched)
        }
        await this.appendLogAsync(text)
      }
    }
  }

  private async appendLogAsync(text: string): Promise<void> {
    const log = text.replaceAll(Bot.EscapesRE, '').replaceAll('\r\n', '\n').replaceAll('\n', '').trim()
    if (this.threshold < log.length)
      await this.db.xAdd(Bot.LogKey, '*', { log })
  }

  get length(): Promise<number> {
    return this.db.xLen(Bot.LogKey)
  }

  private async locateBacklogsAsync(matched: RegExpMatchArray): Promise<void> {
    const { count } = matched.groups
    const c = parseInt(count)
    const contents = new Array<string>()
    for (const data of await this.queryAsync('+', '-', { COUNT: isNaN(c) ? 50 : c }))
      contents.push(data.message['log'] as string)
    this.web.createSpeech(contents.join('\n'), this.send.bind(this))
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

  async queryAsync(start: RedisCommandArgument, end: RedisCommandArgument, options?: { COUNT?: number }): Promise<BackLog[]> {
    const list = (await this.db.xRevRange(Bot.LogKey, start, end, options)).reverse() as unknown as BackLog[]
    list.forEach(this.updateRecent.bind(this))
    this.recent.list.sort((lhs: BackLog, rhs: BackLog) => [-1, 1][+(lhs.id < rhs.id)])
    return list
  }

  private send(text: string): void {
    const line = text + '\n'
    process.stdout.write(line)
    this.client.write(line)
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
    const r = await DeepL.translateAsync(match.groups.text)
    if (isDeepLError(r))
      this.send(`[Bot] 翻訳エラー, ${r.message}`)
    else
      for (const t of r.translations) {
        const text = t.text.replaceAll('\r\n', '\n').replaceAll('\n', '').trim()
        this.send(`[翻訳結果:${t.detected_source_language}] ${text}`)
      }
  }

  private updateRecent(backlog: BackLog): void {
    if (!this.recent.map.has(backlog.id)) {
      const index = this.recent.list.findIndex((value: BackLog) => value.id < backlog.id)
      const rhs = this.recent.list.splice(index)
      this.recent.list.push(backlog)
      if (rhs.length)
        this.recent.list.push(...rhs)
      this.recent.map.set(backlog.id, backlog)
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    console.log('disposing bot...')
    console.log('disposing web...')
    this.web[Symbol.dispose]()
    console.log('disconnecting from database...')
    await this.db.disconnect()
    console.log('disconnecting from telnet server...')
    this.client.end()
    console.log('done')
  }
}

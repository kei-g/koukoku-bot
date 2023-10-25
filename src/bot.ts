import * as redis from '@redis/client'
import * as tls from 'tls'
import {
  Action,
  BotInterface,
  DeepL,
  DeepLError,
  DeepLResult,
  GitHub,
  GitHubSpeech,
  IgnorePattern,
  KoukokuProxy,
  KoukokuServer,
  Log,
  PeriodicSchedule,
  PeriodicScheduler,
  PhiLLM,
  ProxyResponse,
  RedisStreamItem,
  SJIS,
  Speech,
  Web,
  compileIgnorePattern,
  describeProxyResponse,
  isDeepLError,
  isDeepLSuccess,
  isGitHubResponse,
  isRedisStreamItemLog,
  shouldBeIgnored,
  suppress,
} from '.'
import { EventEmitter } from 'stream'
import { RedisCommandArgument } from '@redis/client/dist/lib/commands'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'

export class Bot implements AsyncDisposable, BotInterface {
  private static readonly CalcRE = /^計算\s(?<expr>[πEIPaceginopstx\d\s.+\-*/%()]+)$/
  private static readonly DialogueRE = /^対話\s(?<body>.+)$/
  private static readonly HelpRE = /^(?<command>コマンド(リスト)?|ヘルプ)$/
  private static readonly LogRE = /^(バック)?ログ(\s+((?<command>--help)|(?<count>[1-9]\d*)))?$/
  static readonly MessageRE = />>\s「\s(?<msg>[^」]+)\s」\(チャット放話\s-\s(?<date>\d\d\/\d\d)\s\((?<dow>[日月火水木金土])\)\s(?<time>\d\d:\d\d:\d\d)\sby\s(?<host>[^\s]+)\s君(\s(?<self>〈＊あなた様＊〉))?\)\s<</g
  private static readonly SpeechRE = /\s+(★☆){2}\s臨時ニユース\s緊急放送\s(☆★){2}\s(?<date>\p{scx=Han}+\s\d+\s年\s\d+\s月\s\d+\s日\s[日月火水木金土]曜)\s(?<time>\d{2}:\d{2})\s+★\sたった今、(?<host>[^\s]+)\s君より[\S\s]+★\s+＝{3}\s大演説の開闢\s＝{3}\s+(?<body>\S+(\s+\S+)*)\s+＝{3}\s大演説の終焉\s＝{3}\s+/gu
  private static readonly TallyRE = /^集計(\s(?<command>--help))?$/
  private static readonly TranslateRE = /^翻訳\s+((?<command>--(help|lang))|((?<lang>bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh|bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh)\s+)?(?<text>.+))$/i
  private static readonly UserKeywordRE = /^キーワード(?<command>一覧|登録|解除)?(\s(?<name>(--help|[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}\w]{1,8})))?(\s(?<value>[\p{scx=Common}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}\s\w\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+))?$/u

  private static get LogKey(): string {
    return process.env.REDIS_LOG_KEY ?? 'koukoku:log'
  }

  private static get UserKeywordKey(): string {
    return process.env.REDIS_USERKEYWORD_KEY ?? 'koukoku:keywords'
  }

  private client: tls.TLSSocket
  private readonly db: redis.RedisClientType
  private dialogue: PhiLLM.Dialogue
  private idleTimerId: NodeJS.Timeout
  private readonly ignorePatterns = [] as IgnorePattern[]
  private readonly interval: NodeJS.Timeout
  private readonly lang = new DeepL.LanguageMap()
  private readonly received = [] as Buffer[]
  private readonly recent = [] as (RedisStreamItem<Log> | RedisStreamItem<Speech>)[]
  private readonly scheduler = new PeriodicScheduler()
  private readonly speechesSet = new Set<GitHubSpeechWithTimer>()
  private readonly timeSignals = [] as TimeSignal[]
  private readonly userKeywords = new Set<string>()
  private readonly web: Web

  constructor(private readonly server: KoukokuServer, private readonly threshold: number = 70) {
    this.interval = setInterval(KoukokuProxy.pingAsync, parseIntOr(process.env.PROXY_PING_INTERVAL, 120000))
    this.db = redis.createClient({ pingInterval: 15000, url: process.env.REDIS_URL })
    this.scheduler.register(this.announceTimeSignalAsync.bind(this), 'minutely')
    this.web = new Web(this)
  }

  private acceptIfTimeSignal(id: string, message: string): void {
    if (message.startsWith('[時報] ') && !message.includes('代理')) {
      const matched = message.replaceAll(' ', '').match(/\d+年\d+月\d+日\d+時\d+分\d+秒/)
      if (matched) {
        const hrtime = process.hrtime.bigint()
        const time = new Date(matched[0])
        this.timeSignals.unshift({ id, hrtime, time })
      }
    }
  }

  private async acceptKoukoku(data: Buffer): Promise<void> {
    const { idleTimerId } = this
    this.idleTimerId = undefined
    clearTimeout(idleTimerId)
    if (this.threshold < data.byteLength) {
      const text = data.toString().replaceAll(/\r?\n/g, '')
      const matched = [...text.matchAll(Bot.MessageRE)]
      const items = matched.map(this.appendLogAsync.bind(this))
      const jobs = [] as Promise<void>[]
      for (const { item, matched } of await Promise.all(items)) {
        jobs.push(this.web.broadcastAsync(item))
        this.acceptIfTimeSignal(item.id, matched.groups.msg)
        if (!matched.groups.self)
          jobs.push(this.handleCommandAsync(matched))
      }
      await Promise.all(jobs)
    }
    else
      this.received.push(Buffer.from(data.toString().replaceAll('\x07', '')))
    this.idleTimerId = setTimeout(this.onIdle.bind(this), 1000)
  }

  private async acceptSession(data: Buffer): Promise<void> {
    console.log(`new session key, ${data.byteLength} bytes received`)
    await this.db.set('koukoku:session', data.toString('hex'))
  }

  private async announceTimeSignalAsync(schedule: PeriodicSchedule): Promise<void> {
    if (schedule.minute === 1) {
      const signal = this.timeSignals.at(0)
      if (!(schedule.time - schedule.delta - 65000000000n < signal?.hrtime)) { // unless within the latest 65seconds
        const now = new Date()
        const [month, date, hour, minute, second] = [
          now.getMonth() + 1,
          now.getDate(),
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
        ].map((value: number) => ('0' + value.toString()).slice(-2))
        await this.sendAsync(`[時報] ${now.getFullYear()} 年 ${month} 月 ${date} 日 ${hour} 時 ${minute} 分 ${second} 秒です (代理)`)
      }
    }
  }

  private async appendLogAsync(matched: RegExpMatchArray): Promise<MatchedItem> {
    const message = { log: matched[0] }
    const job = this.db.xAdd(Bot.LogKey, '*', message)
    console.log(matched)
    const id = await job
    const item = { id, message }
    this.recent.unshift(item)
    return {
      item,
      matched,
    }
  }

  private async calculateAsync(matched: RegExpMatchArray): Promise<void> {
    const expr = matched.groups.expr
    process.stdout.write(`[calc] \x1b[32m'${expr}'\x1b[m\n`)
    try {
      validateParentheses(expr)
      const keys = new Set(keyNamesOf(global))
      keys.add('globalThis')
      const args = [...keys]
      args.unshift('PI', 'E', 'cos', 'exp', 'log', 'sin', 'tan', 'π')
      args.push(`"use strict";return ${expr}`)
      const f = new Function(...args)
      const value = f(Math.PI, Math.E, Math.cos, Math.exp, Math.log, Math.sin, Math.tan, Math.PI)
      process.stdout.write(`[calc] \x1b[33m${value}\x1b[m\n`)
      await this.sendAsync(`[Bot] 計算結果は${value}です`)
    }
    catch (reason: unknown) {
      await this.sendAsync(`[Bot] 計算エラー, ${reason instanceof Error ? reason.message : reason}`)
    }
  }

  private async complainTranslationError(error: DeepLError | Error): Promise<void> {
    await this.sendAsync(`[Bot] 翻訳エラー, ${error.message}`)
  }

  private async connectAsync(): Promise<void> {
    const { server } = this
    const port = server.port ?? 992
    const serverName = server.name ?? 'koukoku.shadan.open.ad.jp'
    const opts = {
      rejectUnauthorized: server.rejectUnauthorized,
    } as tls.ConnectionOptions
    const data = await this.db.get('koukoku:session')
    if (data)
      opts.session = Buffer.from(data, 'hex')
    this.client = tls.connect(port, serverName, opts, this.connected.bind(this))
    this.client.on('data', this.acceptKoukoku.bind(this))
    this.client.on('error', (error: Error) => console.error({ error }))
    this.client.on('session', this.acceptSession.bind(this))
    this.client.setKeepAlive(true, 15000)
    this.client.setNoDelay(true)
  }

  private connected(): void {
    this.client.write('nobody\r\n')
  }

  async createSpeechAsync(text: string, maxLength: number = 64, remark: boolean = true): Promise<GitHubSpeech> {
    const now = new Date()
    const salt = Buffer.from(now.toISOString(), 'ascii')
    const sha256 = createHash('sha256')
    sha256.update(salt)
    sha256.update(text)
    const hash = sha256.digest().toString('hex').slice(0, maxLength)
    const response = await GitHub.uploadToGistAsync(hash, text)
    if (isGitHubResponse(response)) {
      const { id, rawUrl } = response
      const speech = {
        content: text,
        expiresAt: new Date(now.getTime() + 3e6),
        id,
        timer: setTimeout(
          async () => {
            this.speechesSet.delete(speech)
            await GitHub.deleteGistAsync(id)
          },
          3e6
        ),
        url: rawUrl,
      }
      this.speechesSet.add(speech)
      if (remark)
        await this.sendAsync(rawUrl)
      return speech
    }
    else
      await this.sendAsync('[Bot] 大演説の生成に失敗しました')
  }

  private async createSpeechFromFileAsync(path: string): Promise<void> {
    const data = await readFile(path).catch(suppress)
    if (data) {
      const text = data.toString().trim()
      const time = Date.now().toString(16).slice(2, -2)
      await this.createSpeechAsync(`[Bot@${time}] https://github.com/kei-g/koukoku-bot\n\n${text}`)
    }
  }

  private async createUserKeywordsSpeechAsync(command: string, keywords: Map<string, string>): Promise<void> {
    const now = new Date()
    const list = [] as string[]
    const date = now.toLocaleDateString('ja-JP-u-ca-japanese', { year: 'numeric', month: 'long', day: 'numeric' })
    const time = now.toLocaleTimeString().split(':')
    time.push('時', time.splice(1).join('分'), '秒')
    list.push(`${date}${time.join('')}時点で登録されているキーワードの一覧は以下の通りです`)
    list.push('')
    for (const e of keywords)
      list.push(e.join(' => '))
    if (list.length <= 30)
      await this.createSpeechAsync(list.join('\n'))
    else {
      const speech = await this.createSpeechAsync(list.join('\n'), 7, false)
      const expiresAt = (speech.expiresAt as Date).toLocaleString()
      await this.sendAsync(`[Bot] キーワード${command}を${speech.url}に置きました,期限${expiresAt}`)
    }
  }

  private async describeLogAsync(match: RegExpMatchArray): Promise<void> {
    const name = match.groups.command.slice(2).toLowerCase()
    await this.createSpeechFromFileAsync(`templates/log/${name}.txt`)
  }

  private describeGeneralHelp(_match: RegExpMatchArray): Promise<void> {
    return this.createSpeechFromFileAsync('templates/help.txt')
  }

  private async describeTallyHelp(_match: RegExpMatchArray): Promise<void> {
    await this.createSpeechFromFileAsync('templates/tally/help.txt')
  }

  private async describeTranslation(match: RegExpMatchArray): Promise<void> {
    const name = match.groups.command.slice(2).toLowerCase()
    await this.createSpeechFromFileAsync(`templates/translation/${name}.txt`)
  }

  private async describeUserKeywordAsync(_match: RegExpMatchArray): Promise<void> {
    return this.createSpeechFromFileAsync('templates/keyword/help.txt')
  }

  private determineUserKeywordCommandHandler<T>(match: RegExpMatchArray, template: Record<string, T>): string {
    const { command, name, value } = match.groups
    console.log({ command, name, value })
    const u = +(command !== undefined && (command in template))
    const v = +(command === undefined && name !== undefined)
    console.log({ u, v })
    return [null, name, command, null][u * 2 + v]
  }

  private async dialogueAsync(matched: RegExpMatchArray): Promise<void> {
    const { body } = matched.groups
    let r = await DeepL.translateAsync(body, 'EN')
    if (isDeepLSuccess(r)) {
      r = await this.dialogueTranslatedAsync(r.translations[0].text)
      if (isDeepLSuccess(r))
        return
    }
    await this.complainTranslationError(r)
  }

  private async dialogueTranslatedAsync(message: string): Promise<DeepLResult | Error> {
    const response = await this.dialogue?.speakAsync(message)
    if (response instanceof Error)
      await this.sendAsync(`[Bot] 対話中にエラーが発生しました, ${response.message}`)
    else {
      const translated = await DeepL.translateAsync(response, 'JA')
      if (isDeepLSuccess(translated))
        await this.sendAsync(`[Bot] ${translated.translations[0].text.replaceAll(/\r?\n/g, '')}`)
      return translated
    }
  }

  private getUserKeywordRepliesAsync(includes: Predicate<string>): Promise<string>[] {
    return [...this.userKeywords].filter(includes).map(this.db.hGet.bind(this.db, Bot.UserKeywordKey))
  }

  private async handleCommandAsync(matched: RegExpMatchArray): Promise<void> {
    const handlers = [
      { handle: this.calculateAsync, regexp: Bot.CalcRE },
      { handle: this.dialogueAsync, regexp: Bot.DialogueRE },
      { handle: this.describeGeneralHelp, regexp: Bot.HelpRE },
      { handle: this.locateLogsAsync, regexp: Bot.LogRE },
      { handle: this.handleTallyCommandAsync, regexp: Bot.TallyRE },
      { handle: this.translateOrDescribeAsync, regexp: Bot.TranslateRE },
      { handle: this.handleUserKeywordCommandAsync, regexp: Bot.UserKeywordRE },
    ] as CommandHandler[]
    const text = matched.groups.msg
    const found = {} as { result?: RegExpMatchArray }
    const command = handlers.find(
      (a: CommandHandler) => !!(found.result ??= text.match(a.regexp))
    )
    await (command ? command.handle.bind(this)(found.result) : this.testUserKeywordsAsync(matched))
  }

  private async handleTallyCommandAsync(matched: RegExpMatchArray): Promise<void> {
    await (matched.groups.command === '--help' ? this.describeTallyHelp : this.tallyAsync).bind(this)(matched)
  }

  private async handleUserKeywordCommandAsync(match: RegExpMatchArray): Promise<void> {
    const template = {
      '--help': this.describeUserKeywordAsync,
      '一覧': this.listUserKeywordsAsync,
      '登録': this.registerUserKeywordAsync,
      '解除': this.unregisterUserKeywordAsync,
    } as Record<string, (match: RegExpMatchArray) => Promise<void>>
    const key = this.determineUserKeywordCommandHandler(match, template)
    if (key in template) {
      const t = template[key]
      await t.bind(this)(match)
    }
  }

  get length(): Promise<number> {
    return this.db.xLen(Bot.LogKey)
  }

  private async listUserKeywordsAsync(match: RegExpMatchArray): Promise<void> {
    const { command, name, value } = match.groups
    if (name || value)
      await this.sendAsync(`[Bot] キーワード${command}の構文が正しくありません`)
    else {
      const keywords = createMap(await this.db.hGetAll(Bot.UserKeywordKey))
      await (keywords.size === 0 ? this.sendAsync('[Bot] キーワードは登録されていません') : this.createUserKeywordsSpeechAsync(command, keywords))
    }
  }

  private async loadIgnorePatternsAsync(): Promise<void> {
    const data = await readFile('conf/ignore.json').catch(suppress)
    if (data) {
      const text = data.toString()
      const config = JSON.parse(text) as { ignorePatterns: IgnorePattern[] }
      const patterns = config.ignorePatterns?.map(compileIgnorePattern)?.filter((pattern: IgnorePattern | undefined) => pattern !== undefined)
      this.ignorePatterns.splice(0)
      patterns?.forEach((this.ignorePatterns.push as Action<IgnorePattern>).bind(this.ignorePatterns))
    }
  }

  private async locateLogsAsync(matched: RegExpMatchArray): Promise<void> {
    const { command, count } = matched.groups
    if (command)
      return await this.describeLogAsync(matched)
    const contents = [] as string[]
    const last = {} as { host?: string, message?: string }
    for (const item of this.recent)
      isRedisStreamItemLog(item)
        ? contents.push(...composeLogs(last, item))
        : contents.push(composeLogFromSpeech(last, item))
    await this.createSpeechAsync(contents.slice(0, Math.min(parseIntOr(count, 10), 30)).join('\n'))
  }

  async notifyWebClient(send: (data: (RedisStreamItem<Log> | RedisStreamItem<Speech>)[]) => Promise<void>): Promise<void> {
    await send(this.recent)
  }

  observe(target: EventEmitter): Promise<Buffer> {
    const list = [] as Buffer[]
    target.on('data', list.push.bind(list))
    return new Promise(
      (resolve: Action<Buffer>) => target.on(
        'end',
        async () => {
          const data = Buffer.concat(list).toString()
          const json = JSON.parse(data) as { msg: string, token: string }
          if (json?.token === process.env.PROXY_TOKEN) {
            const response = await this.sendAsync(json?.msg?.trim())
            resolve(Buffer.from(describeProxyResponse(response)))
          }
          else
            resolve(Buffer.from(JSON.stringify({ error: 'bad token' })))
        }
      )
    )
  }

  private async onIdle(): Promise<void> {
    const data = Buffer.concat(this.received)
    const text = data.toString()
    const jobs = [] as Promise<void>[]
    const last = {} as { position?: number }
    for (const matched of text.matchAll(Bot.SpeechRE)) {
      last.position = matched.index + matched[0].length
      const hash = createHash('sha256')
      hash.update(matched[0])
      const digest = hash.digest().toString('hex')
      const { body, date, host, time } = matched.groups
      const message = {
        body,
        date,
        hash: digest,
        host,
        time,
      }
      const job = this.db.xAdd(Bot.LogKey, '*', message).then(
        (id: string): void => this.updateRecent({ id, message })
      )
      jobs.push(job)
      console.log(message)
    }
    if (0 < last.position) {
      const { byteLength } = Buffer.from(text.slice(0, last.position))
      this.received.splice(0)
      this.received.push(data.subarray(byteLength))
    }
    await Promise.all(jobs)
  }

  private async queryLogAsync(start: RedisCommandArgument, end: RedisCommandArgument): Promise<void> {
    const list = await this.db.xRevRange(Bot.LogKey, start, end) as (RedisStreamItem<Log> | RedisStreamItem<Speech>)[]
    list.reverse()
    for (const item of list)
      this.updateRecent(item)
    this.recent.sort(
      (lhs: RedisStreamItem<Log | Speech>, rhs: RedisStreamItem<Log | Speech>) => [-1, 1][+(lhs.id < rhs.id)]
    )
  }

  private async queryUserKeywordsAsync(): Promise<void> {
    this.userKeywords.clear()
    for (const keyword of await this.db.hKeys(Bot.UserKeywordKey))
      this.userKeywords.add(keyword)
  }

  private async registerUserKeywordAsync(match: RegExpMatchArray): Promise<void> {
    const { command, name, value } = match.groups
    const text = '[Bot] キーワード' + ((name && value) ? (` "${name}" ` + ['は既に登録されています', 'を登録しました'][+(await this.db.hSetNX(Bot.UserKeywordKey, name, value))]) : `${command}の構文が正しくありません`)
    if (text.endsWith('を登録しました'))
      this.userKeywords.add(name)
    await this.sendAsync(text)
  }

  private async sendAsync(text: string): Promise<Error | ProxyResponse> {
    process.stdout.write(text + '\n')
    return await KoukokuProxy.sendAsync(text)
  }

  private shouldBeAccepted(matched: RegExpMatchArray): boolean {
    return !shouldBeIgnored(matched, this.ignorePatterns)
  }

  get speeches(): GitHubSpeech[] {
    return [...this.speechesSet]
  }

  async startAsync(): Promise<void> {
    PhiLLM.Dialogue.create(
      {
        maxLength: 50,
      }
    ).then(
      (dialogue: PhiLLM.Dialogue) => this.dialogue = dialogue
    )
    await Promise.allSettled(
      [
        this.db.connect().then(
          () => Promise.allSettled(
            [
              this.queryLogAsync('+', '-'),
              this.queryUserKeywordsAsync(),
            ]
          )
        ),
        this.loadIgnorePatternsAsync(),
        this.web.loadAssetsAsync(),
      ]
    )
    await this.connectAsync()
  }

  private tally(_matched: RegExpMatchArray): string[] {
    const weekly = new Map<number, Map<string, RegExpMatchArray[]>>()
    this.tallyWeekly(weekly)
    const weeks = [...weekly.keys()].sort(descending)
    const list = [] as string[]
    for (const x of [{ name: '今', week: weeks[0] }, { name: '先', week: weeks[1] }]) {
      const hosts = weekly.get(x.week)
      list.push(`[Bot] ${x.name}週の逆引きホスト名で区別可能なクライアントの数は ${hosts.size} で、発言回数の多かったものは次の通りです`)
      list.push(...[...hosts].sort(descendingByFrequency).map(e => `[Bot] ${e[0].replaceAll(/(\*+[-.]?)+/g, '')} ${e[1].length} 回`).slice(0, 5))
    }
    return list
  }

  private async tallyAsync(matched: RegExpMatchArray): Promise<void> {
    const now = new Date()
    const list = [] as string[]
    const date = now.toLocaleDateString('ja-JP-u-ca-japanese', { year: 'numeric', month: 'long', day: 'numeric' })
    const time = now.toLocaleTimeString().split(':')
    time.push('時', time.splice(1).join('分'), '秒')
    list.push(`[Bot] ${date}${time.join('')}時点の集計結果`)
    list.push('')
    this.tally(matched).forEach((text: string) => list.push(text))
    await this.createSpeechAsync(list.join('\n'))
  }

  private tallyWeekly(weekly: Map<number, Map<string, RegExpMatchArray[]>>): void {
    const now = new Date()
    const epoch = new Date(now.getFullYear(), 0, 1).getTime()
    for (const item of this.recent.filter(isRedisStreamItemLog))
      for (const m of item.message.log.matchAll(Bot.MessageRE)) {
        const timestamp = new Date(parseInt(item.id.split('-')[0])).getTime()
        const numberOfDays = Math.floor((timestamp - epoch) / (24 * 60 * 60 * 1000))
        const week = Math.ceil((now.getDay() + 1 + numberOfDays) / 7)
        const hosts = weekly.get(week) ?? new Map<string, RegExpMatchArray[]>()
        const { host } = m.groups
        const list = hosts.get(host) ?? []
        list.push(m)
        hosts.set(host, list)
        weekly.set(week, hosts)
      }
  }

  private async testUserKeywordsAsync(matched: RegExpMatchArray): Promise<void> {
    if (this.shouldBeAccepted(matched))
      await Promise.all(
        this.getUserKeywordRepliesAsync(
          (keyword: string) => matched.groups.msg.includes(keyword)
        ).map(
          async (reply: Promise<string>) => this.sendAsync(`[Bot] ${await reply}`)
        )
      )
  }

  private async translateAsync(match: RegExpMatchArray): Promise<void> {
    const { lang } = match.groups
    const text = match.groups.text.replaceAll(/(\s+%|\s+%\s+|%\s+)/g, '%')
    const to = this.lang.getName(lang)?.concat('に') ?? ''
    const r = await DeepL.translateAsync(decodeURI(text), lang)
    if (isDeepLError(r))
      await this.sendAsync(`[Bot] 翻訳エラー, ${r.message}`)
    else
      for (const t of r.translations) {
        const name = this.lang.getName(t.detected_source_language)
        const escaped = await SJIS.escape(t.text.replaceAll(/\r?\n/g, '').trim())
        await this.sendAsync(`[Bot] (${name}から${to}翻訳) ${escaped}`)
      }
  }

  private async translateOrDescribeAsync(match: RegExpMatchArray): Promise<void> {
    (match.groups.command ? this.describeTranslation : this.translateAsync).bind(this)(match)
  }

  private async unregisterUserKeywordAsync(match: RegExpMatchArray): Promise<void> {
    const { command, name, value } = match.groups
    const text = '[Bot] キーワード' + ((name && !value) ? (` "${name}" ` + ['は未登録です', 'を登録解除しました'][+(await this.db.hDel(Bot.UserKeywordKey, name))]) : `${command}の構文が正しくありません`)
    if (text.endsWith('を登録解除しました'))
      this.userKeywords.delete(name)
    await this.sendAsync(text)
  }

  private updateRecent(item: RedisStreamItem<Log> | RedisStreamItem<Speech>): void {
    const index = this.recent.findIndex(
      (value: RedisStreamItem<Log | Speech>) => value.id < item.id
    )
    const rhs = this.recent.splice(index)
    this.recent.push(item)
    if (rhs.length)
      this.recent.push(...rhs)
  }

  async[Symbol.asyncDispose](): Promise<void> {
    console.log('disposing bot...')
    this.scheduler[Symbol.dispose]()
    clearInterval(this.interval)
    console.log('disposing web...')
    const jobs = [] as Promise<number | void>[]
    jobs.push(this.web[Symbol.asyncDispose]())
    console.log('deleting gists...')
    const speeches = [...this.speechesSet]
    this.speechesSet.clear()
    for (const speech of speeches) {
      clearTimeout(speech.timer)
      jobs.push(GitHub.deleteGistAsync(speech.id))
    }
    console.log('disconnecting from database...')
    jobs.push(this.db.disconnect())
    console.log('disconnecting from telnet server...')
    this.client.end()
    this.dialogue?.[Symbol.dispose]?.()
    await Promise.all(jobs)
    console.log('done')
  }
}

type CommandHandler = {
  handle: (matched: RegExpMatchArray) => Promise<void>
  regexp: RegExp
}

type GitHubSpeechWithTimer = GitHubSpeech & {
  timer: NodeJS.Timeout
}

type MatchedItem = {
  item: RedisStreamItem<Log>
  matched: RegExpMatchArray
}

type Parenthesis = {
  opened: number
  qualifier: string
}

type Predicate<T> = (value: T) => boolean

type TimeSignal = {
  hrtime: bigint
  id: string
  time: Date
}

function* composeLogs(last: { host?: string, message?: string }, item: RedisStreamItem<Log>) {
  for (const line of item.message.log.split(/\r?\n/))
    for (const matched of [...line.matchAll(Bot.MessageRE)].filter(isNotBot).filter(isNotTimeSignal)) {
      const current = {
        host: matched.groups.host.replaceAll(/(\*+[-.]?)+/g, ''),
        message: matched.groups.msg.trim(),
      }
      current.host === last.host ? current.host = '〃' : last.host = current.host
      current.message === last.message ? current.message = '〃' : last.message = current.message
      yield [
        matched.groups.date,
        matched.groups.time,
        current.message,
        current.host,
      ].join(' ')
    }
}

const composeLogFromSpeech = (last: { host?: string, message?: string }, item: RedisStreamItem<Speech>): string => {
  const lines = item.message.body.split(/\r?\n/)
  const { length } = lines
  const suffix = [` ${length - 1} 行省略`, ''][+(length === 1)]
  const current = {
    host: item.message.host.replaceAll(/(\*+[-.]?)+/g, ''),
  }
  current.host === last.host ? current.host = '〃' : last.host = current.host
  delete last.message
  const matched = item.message.date.match(/(?<month>\d+)\s月\s(?<day>\d+)\s日/)
  const { month, day } = matched.groups
  return `${month}/${day} ${item.message.time}:** ${lines[0]}${suffix} ${current.host}`
}

const createMap = (obj: { [key: string]: string }) => {
  const map = new Map<string, string>()
  for (const key in obj) {
    const value = obj[key]
    map.set(key, value)
  }
  return map
}

const descending = (lhs: number, rhs: number) => rhs - lhs

const descendingByFrequency = (lhs: [string, RegExpMatchArray[]], rhs: [string, RegExpMatchArray[]]) => rhs[1].length - lhs[1].length

const isNotBot = (matched: RegExpMatchArray) => !matched.groups.msg.startsWith('[Bot] ')

const isNotTimeSignal = (matched: RegExpMatchArray) => !matched.groups.msg.startsWith('[時報] ')

const keyNamesOf = (obj: Record<string, unknown>) => {
  const keys = [] as string[]
  for (const key in obj)
    keys.push(key)
  return keys
}

const parseIntOr = (text: string, defaultValue: number, radix?: number) => {
  const c = parseInt(text, radix)
  return isNaN(c) ? defaultValue : c
}

const updateParenthesisContext = (ctx: Parenthesis, c: string) => {
  const addendum = valueForParenthesis[c]
  if (addendum === undefined)
    ctx.qualifier += c
  else {
    validateQualifier(ctx)
    ctx.opened += addendum
    ctx.qualifier = ''
  }
  return ctx
}

const validateParentheses = (expr: string): void => {
  const parenthesis = [...expr].reduce(updateParenthesisContext, { opened: 0, qualifier: '' })
  const messages = [
    `${parenthesis.opened}個の閉じ括弧が不足しています`,
    undefined,
    '不正な閉じ括弧があります',
  ]
  const index = (+isNaN(parenthesis.opened)) * 2 + +(parenthesis.opened === 0)
  const message = messages[index]
  if (typeof message === 'string')
    throw new Error(message)
}

const validateQualifier = (ctx: Parenthesis) => {
  console.log(ctx)
  if (ctx.qualifier.length && !['cos', 'exp', 'log', 'sin', 'tan'].includes(ctx.qualifier.trim()))
    throw new Error(`${ctx.qualifier}は関数ではありません`)
}

const valueForParenthesis = {
  ' ': 0,
  '%': 0,
  '(': 1,
  ')': -1,
  '*': 0,
  '+': 0,
  '-': 0,
  '.': 0,
  '/': 0,
  '0': 0,
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 0,
} as Record<string, number>

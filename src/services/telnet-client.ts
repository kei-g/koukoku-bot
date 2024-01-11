import {
  Action,
  DatabaseService,
  Injectable,
  Log,
  Service,
  Speech,
  parseIntOr,
} from '..'
import {
  ConnectionOptions,
  TLSSocket,
  connect,
} from 'tls'
import { EventEmitter } from 'events'

type BufferWithTimestamp = {
  timestamp: number
  value: Buffer
}

@Injectable({
  DependsOn: [
    DatabaseService,
  ]
})
export class TelnetClientService implements Service {
  readonly #client = new WeakMap<this, TLSSocket>()
  readonly #db: DatabaseService
  readonly #eventEmitter = new EventEmitter()
  readonly #idleTimerId = new WeakMap<this, NodeJS.Timeout>()
  readonly #key: string
  readonly #received = [] as BufferWithTimestamp[]

  async #acceptData(data: Buffer): Promise<void> {
    const timestamp = Date.now()
    const idleTimerId = this.#idleTimerId.get(this)
    clearTimeout(idleTimerId)
    this.#idleTimerId.delete(this)
    if (data.byteLength <= 70) {
      const value = Buffer.from(data.toString().replaceAll('\x07', ''))
      this.#received.push({ timestamp, value })
    }
    else {
      const text = data.toString().replaceAll(/\r?\n/g, '')
      for (const matched of text.matchAll(messageRE)) {
        const { body, date, dow, forgery, host, self, time } = matched.groups
        const log = { body, date, dow, forgery, host, self, time } as Log
        if (forgery === undefined)
          delete log.forgery
        if (self === undefined)
          delete log.self
        this.#dispatch('message', log, matched[0], timestamp)
        dumpMatched(matched)
      }
    }
    this.#idleTimerId.set(this, setTimeout(this.#idle.bind(this, timestamp), 125))
  }

  async #acceptSession(data: Buffer): Promise<void> {
    console.log(`new session key, \x1b[33m${data.byteLength}\x1b[m bytes received`)
    await this.#db.set(this.#key, data.toString('hex'))
  }

  async #connect(): Promise<void> {
    const opts = {
      rejectUnauthorized: !process.argv.includes('--no-reject-unauthorized'),
    } as ConnectionOptions
    const data = await this.#db.get(this.#key)
    if (data)
      opts.session = Buffer.from(data, 'hex')
    await this.#connectWithOption(opts)
  }

  #connectWithOption(opts: ConnectionOptions): Promise<Error> {
    return new Promise(
      (resolve: Action<Error>) => {
        const { TELNET_SERVER_NAME, TELNET_SERVER_PORT } = process.env
        const port = parseIntOr(TELNET_SERVER_PORT, 992)
        const serverName = TELNET_SERVER_NAME ?? 'koukoku.shadan.open.ad.jp'
        console.log(`connecting to ${serverName}:${port}`)
        const client = connect(port, serverName, opts, this.#connected.bind(this, resolve))
        this.#client.set(this, client)
        client.on('data', this.#acceptData.bind(this))
        client.on('end', this.#connect.bind(this))
        client.on(
          'error',
          (error: Error) => {
            console.error({ error })
            const client = this.#client.get(this)
            client?.removeAllListeners()
            client?.unref()
            this.#client.delete(this)
            this.#connect()
          }
        )
        client.once('session', this.#acceptSession.bind(this))
        client.setKeepAlive(true, 15000)
        client.setNoDelay(true)
      }
    )
  }

  #connected(cb: Action<Error>): void {
    const client = this.#client.get(this)
    client?.write('nobody\r\n', cb)
    console.log(`connection established from ${client.localAddress}:${client.localPort} to ${client.remoteAddress}:${client.remotePort}`)
  }

  #dispatch(eventName: 'message', log: Log, rawMessage: string, timestamp: number): void
  #dispatch(eventName: 'speech', speech: Omit<Speech, 'hash'>, rawMessage: string, timestamp: number): void
  #dispatch(eventName: 'message' | 'speech', value: Log | Omit<Speech, 'hash'>, rawMessage: string, timestamp: number): void {
    queueMicrotask(
      this.#eventEmitter.emit.bind(this.#eventEmitter, eventName, value, rawMessage, timestamp)
    )
  }

  async #idle(timestamp: number): Promise<void> {
    const data = Buffer.concat(this.#received.map(ofValue))
    const finished = `${timestamp}`
    const text = data.toString()
    const last = {} as { position?: number }
    for (const matched of text.matchAll(speechRE)) {
      last.position = matched.index + matched[0].length
      const { body, date, host, time } = matched.groups
      const speech = { body, date, finished, host, time }
      this.#dispatch('speech', speech, matched[0], this.#timestampAt(Buffer.from(text.slice(0, matched.index)).byteLength))
      dumpMatched(matched)
    }
    const { position } = last
    if (0 < position) {
      const value = data.subarray(Buffer.from(text.slice(0, position)).byteLength)
      const index = +(value.byteLength === 0)
      const timestampAt = [this.#timestampAt.bind(this), undefined][index]
      const timestamp = timestampAt?.(position)
      this.#received.splice(0)
      const push = [this.#received.push.bind(this.#received), undefined][index]
      push?.({ timestamp, value })
    }
  }

  #timestampAt(position: number): number | undefined {
    const ctx = { offset: 0 }
    const found = this.#received.find(
      (item: BufferWithTimestamp) => {
        const { offset } = ctx
        ctx.offset += item.value.byteLength
        return offset <= position && position < ctx.offset
      }
    )
    return found?.timestamp
  }

  constructor(
    db: DatabaseService
  ) {
    this.#db = db
    this.#key = process.env.REDIS_SESSION_KEY ?? 'koukoku:session'
  }

  on(eventName: 'message', listener: (log: Log, rawMessage: string, timestamp: number) => PromiseLike<void>): this
  on(eventName: 'speech', listener: (speech: Omit<Speech, 'hash'>, rawMessage: string, timestamp: number | undefined) => PromiseLike<void>): this
  on(eventName: 'message' | 'speech', listener: ((log: Log, rawMessage: string, timestamp: number) => PromiseLike<void>) | ((speech: Omit<Speech, 'hash'>, rawMessage: string, timestamp: number | undefined) => PromiseLike<void>)): this {
    this.#eventEmitter.on(eventName, listener)
    return this
  }

  async start(): Promise<void> {
    await this.#connect()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const client = this.#client.get(this)
    this.#client.delete(this)
    this.#eventEmitter.removeAllListeners()
    client.unref()
  }
}

const dumpMatched = (matched: RegExpMatchArray) => {
  const { groups: g, index, input } = matched
  const groups = {} as Record<string, string>
  for (const key in g)
    groups[key] = g[key]
  console.log({ groups, index, input, matched: matched[0] })
}

const messageRE = />>\s「\s(?<body>[^」]+(?=\s」))\s」\(チャット放話\s-\s(?<date>\d\d\/\d\d)\s\((?<dow>[日月火水木金土])\)\s(?<time>\d\d:\d\d:\d\d)\sby\s(?<host>[^\s]+)(\s\((?<forgery>※\s贋作\sDNS\s逆引の疑い)\))?\s君(\s(?<self>〈＊あなた様＊〉))?\)\s<</g

const ofValue = (item: BufferWithTimestamp) => item.value

const speechRE = /\s+(★☆){2}\s臨時ニユース\s緊急放送\s(☆★){2}\s(?<date>\p{scx=Han}+\s\d+\s年\s\d+\s月\s\d+\s日\s[日月火水木金土]曜)\s(?<time>\d{2}:\d{2})\s+★\sたった今、(?<host>[^\s]+)\s君より[\S\s]+★\s+＝{3}\s大演説の開闢\s＝{3}(\r\n){2}(?<body>[\S\s]+(?=(\r\n){2}))\s+＝{3}\s大演説の終焉\s＝{3}\s+/gu

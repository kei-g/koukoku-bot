import {
  Action,
  DatabaseService,
  Injectable,
  Service,
  messageRE,
  parseIntOr,
} from '..'
import {
  ConnectionOptions,
  TLSSocket,
  connect,
} from 'tls'
import { EventEmitter } from 'events'

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
  readonly #received = [] as Buffer[]

  async #acceptData(data: Buffer): Promise<void> {
    const idleTimerId = this.#idleTimerId.get(this)
    clearTimeout(idleTimerId)
    this.#idleTimerId.delete(this)
    if (data.byteLength <= 70)
      this.#received.push(Buffer.from(data.toString().replaceAll('\x07', '')))
    else {
      const text = data.toString().replaceAll(/\r?\n/g, '')
      for (const matched of text.matchAll(messageRE))
        this.#eventEmitter.emit('message', matched)
    }
    this.#idleTimerId.set(this, setTimeout(this.#idle.bind(this), 125))
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
        client.on('error', (error: Error) => console.error({ error }))
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

  async #idle(): Promise<void> {
    const data = Buffer.concat(this.#received)
    const text = data.toString()
    const last = {} as { position?: number }
    for (const matched of text.matchAll(speechRE)) {
      last.position = matched.index + matched[0].length
      this.#eventEmitter.emit('speech', matched)
    }
    if (0 < last.position) {
      const { byteLength } = Buffer.from(text.slice(0, last.position))
      this.#received.splice(0)
      this.#received.push(data.subarray(byteLength))
    }
  }

  constructor(
    db: DatabaseService
  ) {
    this.#db = db
    this.#key = process.env.REDIS_SESSION_KEY ?? 'koukoku:session'
  }

  on(eventName: 'message' | 'speech', listener: (matched: RegExpMatchArray) => PromiseLike<void>): this {
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

const speechRE = /\s+(★☆){2}\s臨時ニユース\s緊急放送\s(☆★){2}\s(?<date>\p{scx=Han}+\s\d+\s年\s\d+\s月\s\d+\s日\s[日月火水木金土]曜)\s(?<time>\d{2}:\d{2})\s+★\sたった今、(?<host>[^\s]+)\s君より[\S\s]+★\s+＝{3}\s大演説の開闢\s＝{3}\s+(?<body>\S+(\s+\S+)*)\s+＝{3}\s大演説の終焉\s＝{3}\s+/gu

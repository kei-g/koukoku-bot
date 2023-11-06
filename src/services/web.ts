import {
  Action,
  AsyncAction,
  DependencyResolver,
  Injectable,
  KoukokuProxyService,
  Log,
  LogService,
  PromiseList,
  RedisStreamItem,
  Service,
  Speech,
  applyEnvironmentVariables,
  describeKoukokuProxyResponse,
  parseIntOr,
  suppress,
} from '..'
import { Duplex } from 'stream'
import { EventEmitter } from 'events'
import { Http2SecureServer, SecureServerOptions, createSecureServer } from 'http2'
import { IncomingMessage, ServerResponse } from 'http'
import { RawData, WebSocket as WebSocketClient, WebSocketServer } from 'ws'
import { join as joinPath } from 'path'
import { readFile, readdir } from 'fs/promises'

@Injectable({
  DependsOn: [
    LogService,
    KoukokuProxyService,
    DependencyResolver,
  ]
})
export class WebService implements Service {
  readonly #assets = new Map<string, Buffer>()
  readonly #clients = new Set<WebSocketClient>()
  readonly #host: string
  readonly #logService: LogService
  readonly #messages = new Array<string>()
  readonly #pending = new WeakMap<WebSocketClient, RedisStreamItem<Log | Speech>[]>()
  readonly #proxyService: KoukokuProxyService
  readonly #server: Http2SecureServer
  readonly #webSocket: WebSocketServer

  #acceptWebSocket(client: WebSocketClient): void {
    this.#messages.push(`connected from ${client.url}`)
    client.on('error', this.#acceptWebSocketError.bind(this))
    client.on('close', this.#acceptWebSocketClose.bind(this, client))
    client.on('message', this.#acceptWebSocketMessage.bind(this))
    client.on('open', this.#acceptWebSocketOpen.bind(this))
    client.on('ping', this.#acceptWebSocketPing.bind(this))
    client.on('upgrade', this.#acceptWebSocketUpgrade.bind(this))
    this.#clients.add(client)
    queueMicrotask(this.#notifyWebClient.bind(this, client))
  }

  #acceptWebSocketClose(client: WebSocketClient, code: number, reason: Buffer): void {
    this.#messages.push(`closed: ${code.toString(16)}, reason: 「'${reason.toString()}」`)
    this.#clients.delete(client)
  }

  #acceptWebSocketError(error: Error): void {
    this.#messages.push(`error: ${error.message}`)
  }

  #acceptWebSocketMessage(data: RawData, isBinary: boolean): void {
    this.#messages.push(`data: ${isBinary ? data.slice(0) : data.toString()}`)
  }

  #acceptWebSocketOpen(): void {
    this.#messages.push('open')
  }

  #acceptWebSocketPing(data: Buffer): void {
    this.#messages.push(`ping: ${data.toString()}`)
  }

  #acceptWebSocketUpgrade(req: IncomingMessage): void {
    this.#messages.push(`upgrade: ${req.method} for ${req.url}`)
  }

  #enqueuePending(client: WebSocketClient, ...data: RedisStreamItem<Log | Speech>[]): void {
    const list = this.#pending.get(client)
    list ? list.unshift(...data.reverse()) : this.#pending.set(client, data)
    this.#flushPendingLater(client)
  }

  #flushPending(client: WebSocketClient): void {
    const list = this.#pending.get(client)
    if (list?.length) {
      const json = JSON.stringify(list)
      const data = Buffer.from(json)
      client.readyState === WebSocketClient.OPEN
        ? (client.send(data), list.splice(0))
        : this.#flushPendingLater(client)
    }
  }

  #flushPendingLater(client: WebSocketClient): void {
    setTimeout(this.#flushPending.bind(this, client), 125)
  }

  async #handleGetRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const routes = {
      '': this.#respondRoot.bind(this, request, response),
      'health': this.#respondHealth.bind(this, request, response),
      'status': this.#respondStatus.bind(this, request, response),
    } as Record<string, AsyncAction>
    for (const name of this.#assets.keys())
      routes[name] = this.#respondAssetFile.bind(this, request, response)
    const { url } = request
    const names = url.split('/').slice(1)
    const name = names.at(0)
    if (name in routes)
      await routes[name]()
    else {
      response.statusCode = 302
      response.setHeader('Location', '/')
    }
  }

  async #handleHttp2Request(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const now = new Date()
    response.setHeader('Date', now.toUTCString())
    response.setHeader('Server', this.#host)
    const handlers = {
      GET: this.#handleGetRequest.bind(this, request, response),
      HEAD: this.#handleGetRequest.bind(this, request, response),
      POST: this.#handlePostRequest.bind(this, request, response),
    } as Record<string, AsyncAction>
    if (request.method in handlers)
      await handlers[request.method]()
    else
      response.statusCode = 403
    response.end()
  }

  async #handlePostRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers['content-type'] === 'application/json' && request.url === '/post') {
      const json = await readRequestAsJSON<{ msg: string, token: string }>(request)
      if (json?.token === process.env.PROXY_TOKEN) {
        const data = Buffer.from(
          describeKoukokuProxyResponse(
            await this.#proxyService.post(json?.msg)
          )
        )
        response.statusCode = 202
        response.setHeader('Content-Length', data.byteLength)
        response.setHeader('Content-Type', 'application/json')
        response.write(data)
      }
      else
        response.statusCode = 401
    }
    else
      response.statusCode = 403
  }

  #handleUpgradeRequest(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.#webSocket.handleUpgrade(request, socket, head, this.#webSocket.emit.bind(this.#webSocket, 'connection'))
  }

  async #loadAssets(): Promise<void> {
    for (const entry of await readdir('assets', { withFileTypes: true }))
      if (entry.isFile()) {
        const { name } = entry
        const data = await readFile(joinPath('assets', name)).catch(suppress)
        data ? this.#assets.set(name, data) : this.#assets.delete(name)
      }
  }

  async #notifyWebClient(client: WebSocketClient): Promise<void> {
    const items = await this.#logService.query('+', '-', 100)
    items.reverse()
    for (const item of items) {
      const json = JSON.stringify(item)
      const buffer = Buffer.from(json)
      client.readyState === WebSocketClient.OPEN
        ? await new Promise(
          (resolve: Action<Error | undefined>) => client.send(buffer, resolve)
        )
        : this.#enqueuePending(client, item)
    }
  }

  async #respondAssetFile(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { url } = request
    await this.#respondAssetFileForUrl(url, response)
  }

  async #respondAssetFileForUrl(url: string, response: ServerResponse): Promise<void> {
    const name = url.split('/').slice(1).at(0)
    const ext = name.split('.').at(-1)
    const types = {
      css: 'text/css',
      html: 'text/html',
      ico: 'image/vnd.microsoft.icon',
      js: 'text/javascript',
      png: 'image/png',
      webmanifest: 'application/manifest+json',
    } as Record<string, string>
    const path = joinPath('assets', name)
    const originalData = await readFile(path).catch(suppress)
    if (originalData) {
      const data = (['css', 'html', 'js', 'webmanifest'].includes(ext))
        ? Buffer.from(applyEnvironmentVariables(originalData.toString()))
        : originalData
      response.statusCode = 200
      response.setHeader('Content-Length', data.byteLength)
      response.setHeader('Content-Type', types[name.split('.').at(-1)])
      response.write(data)
    }
    else
      response.statusCode = 404
  }

  async #respondHealth(_request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.statusCode = 200
    await Promise.resolve()
  }

  async #respondRoot(_request: IncomingMessage, response: ServerResponse): Promise<void> {
    await this.#respondAssetFileForUrl('/main.html', response)
  }

  async #respondStatus(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const status = { messages: this.#messages }
    const json = JSON.stringify(status, undefined, 2)
    const resource = Buffer.from(json)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Content-Length', resource.byteLength)
    if (request.method === 'GET')
      response.write(resource)
  }

  constructor(
    logService: LogService,
    proxyService: KoukokuProxyService,
    resolver: DependencyResolver
  ) {
    this.#host = process.env.HOST ?? 'localhost'
    this.#logService = logService
    this.#proxyService = proxyService
    const cert = resolver.argument<Buffer | NodeJS.ErrnoException>(0)
    const key = resolver.argument<Buffer | NodeJS.ErrnoException>(1)
    const opts = { allowHTTP1: true } as SecureServerOptions
    if (Buffer.isBuffer(cert))
      opts.cert = cert
    if (Buffer.isBuffer(key))
      opts.key = key
    this.#server = createSecureServer(opts)
    this.#server.on('request', this.#handleHttp2Request.bind(this))
    this.#server.on('upgrade', this.#handleUpgradeRequest.bind(this))
    this.#server.listen(parseIntOr(process.env.PORT, undefined))
    this.#webSocket = new WebSocketServer({ noServer: true })
    this.#webSocket.on('connection', this.#acceptWebSocket.bind(this))
  }

  async broadcast(item: RedisStreamItem<Log | Speech>): Promise<void> {
    if (item) {
      const ctx = {} as { data?: Buffer }
      await using list = new PromiseList()
      for (const client of this.#clients)
        if (client.readyState === WebSocketClient.OPEN) {
          ctx.data ??= Buffer.from(JSON.stringify(item))
          const job = new Promise(
            (resolve: Action<Error | undefined>) => client.send(ctx.data, resolve)
          )
          list.push(job)
        }
        else
          this.#enqueuePending(client, item)
    }
  }

  async start(): Promise<void> {
    await this.#loadAssets()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await using list = new PromiseList()
    list.push(new Promise((resolve: Action<Error | undefined>) => this.#server.close(resolve)))
    this.#clients.forEach((client: WebSocketClient) => client.close())
    this.#clients.clear()
    list.push(new Promise((resolve: Action<Error | undefined>) => this.#webSocket.close(resolve)))
  }
}

const readRequestAsJSON = <T>(source: EventEmitter): Promise<T> => {
  const list = [] as Buffer[]
  source.on('data', list.push.bind(list))
  return new Promise(
    (resolve: Action<T>) => source.on(
      'end',
      () => {
        const data = Buffer.concat(list)
        resolve(JSON.parse(data.toString()) as T)
      }
    )
  )
}

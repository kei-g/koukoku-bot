import WebSocket from 'ws'
import { BotInterface, Log, Speech, replaceVariables } from '.'
import { IncomingMessage, Server, ServerResponse, createServer } from 'http'
import { WebSocket as WebSocketClient, WebSocketServer } from 'ws'
import { join as joinPath } from 'path'
import { promisify } from 'util'
import { readFile, readdir } from 'fs'

type AsyncFunction = () => Promise<void>

export class Web implements Disposable {
  private readonly assets = new Map<string, Buffer>()
  private readonly messages = new Array<string>()
  private readonly pending = new WeakMap<WebSocketClient, Log[]>()
  private readonly server: Server
  private readonly speeches = new Map<string, Speech>()
  private readonly webClients = new Set<WebSocketClient>()
  private readonly webSocket: WebSocketServer

  constructor(private readonly bot: BotInterface) {
    this.server = createServer()
    this.server.on('request', this.handleHttp2Request.bind(this))
    this.server.listen(this.port)
    this.webSocket = new WebSocketServer({ server: this.server })
    this.webSocket.on('connection', this.acceptWebSocket.bind(this))
  }

  private acceptWebSocket(client: WebSocketClient): void {
    this.messages.push('connected from ' + client.url)
    client.on('error', (error: Error) => this.messages.push('error: ' + error.message))
    client.on('close', (code: number, reason: Buffer) => (this.messages.push('closed: ' + code.toString(16) + ', reason: 「' + reason.toString() + '」'), this.webClients.delete(client)))
    client.on('message', (data: WebSocket.RawData, isBinary: boolean) => this.messages.push('data: ' + isBinary ? `${data.slice(0)}` : data.toString()))
    client.on('open', () => this.messages.push('open'))
    client.on('ping', (data: Buffer) => this.messages.push('ping: ' + data.toString()))
    client.on('upgrade', (req: IncomingMessage) => this.messages.push('upgrade: ' + req.method + ' for ' + req.url))
    this.webClients.add(client)
    queueMicrotask(this.notifyWebClient.bind(this, client))
  }

  broadcast(value: Log): void {
    if (value) {
      const json = JSON.stringify(value)
      const data = Buffer.from(json)
      for (const client of this.webClients)
        if (client.readyState === WebSocketClient.OPEN)
          client.send(data)
        else
          this.enqueuePending(client, value)
    }
  }

  private enqueuePending(client: WebSocketClient, ...data: Log[]): void {
    const list = this.pending.get(client)
    if (list)
      list.unshift(...data.reverse())
    else
      this.pending.set(client, data)
    setTimeout(this.flushPending.bind(this, client), 125)
  }

  private flushPending(client: WebSocketClient): void {
    const list = this.pending.get(client)
    if (list?.length) {
      const json = JSON.stringify(list)
      const data = Buffer.from(json)
      client.readyState === WebSocketClient.OPEN ? (client.send(data), list.splice(0)) : setTimeout(this.flushPending.bind(this, client), 125)
    }
  }

  private async handleGetRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const routes = {
      '': this.respondRootAsync.bind(this, request, response),
      'health': this.respondHealthAsync.bind(this, request, response),
      'status': this.respondStatusAsync.bind(this, request, response),
    } as Record<string, AsyncFunction>
    for (const name of this.assets.keys())
      routes[name] = this.respondAssetFileAsync.bind(this, request, response)
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

  private async handleHttp2Request(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const now = new Date()
    response.setHeader('Date', now.toUTCString())
    response.setHeader('Server', this.host)
    const handlers = {
      GET: this.handleGetRequest.bind(this, request, response),
      HEAD: this.handleGetRequest.bind(this, request, response),
      POST: this.handlePostRequest.bind(this, request, response),
    } as Record<string, AsyncFunction>
    if (request.method in handlers)
      await handlers[request.method]()
    else
      response.statusCode = 403
    response.end()
  }

  private async handlePostRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { url } = request
    if (url === '/post') {
      const list = new Array<Buffer>()
      request.on('data', list.push.bind(list))
      await new Promise<void>((resolve: () => void) => request.on('end', this.bot.post.bind(this.bot, list, resolve)))
      const ok = Buffer.from(JSON.stringify({ accepted: true }))
      response.statusCode = 202
      response.setHeader('Content-Length', ok.byteLength)
      response.setHeader('Content-Type', 'application/json')
      response.write(ok)
    }
    else
      response.statusCode = 403
  }

  private get host(): string {
    return process.env.HOST ?? 'localhost'
  }

  async loadAssetsAsync(): Promise<void> {
    for (const name of await promisify(readdir)('assets')) {
      const data = await promisify(readFile)(joinPath('assets', name))
      this.assets.set(name, data)
    }
  }

  private notifyWebClient(client: WebSocketClient): void {
    this.bot.notifyWebClient((data: Log[]) => {
      const json = JSON.stringify(data)
      const buffer = Buffer.from(json)
      client.readyState === WebSocketClient.OPEN ? client.send(buffer) : this.enqueuePending(client, ...data)
    })
  }

  get port(): number | undefined {
    const port = parseInt(process.env.PORT ?? Number.NaN.toString())
    return [port, undefined][+isNaN(port)]
  }

  private async respondAssetFileAsync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { url } = request
    await this.respondAssetFileForUrlAsync(url, response)
  }

  private async respondAssetFileForUrlAsync(url: string, response: ServerResponse): Promise<void> {
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
    const originalData = await promisify(readFile)(path)
    const data = (['css', 'html', 'js', 'webmanifest'].includes(ext)) ? replaceVariables(originalData) : originalData
    response.statusCode = 200
    response.setHeader('Content-Length', data.byteLength)
    response.setHeader('Content-Type', types[name.split('.').at(-1)])
    response.write(data)
  }

  private respondHealthAsync(_request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.statusCode = 200
    return Promise.resolve()
  }

  private async respondRootAsync(_request: IncomingMessage, response: ServerResponse): Promise<void> {
    await this.respondAssetFileForUrlAsync('/main.html', response)
  }

  private async respondStatusAsync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const status = { messages: this.messages, speeches: this.bot.speeches }
    status.speeches.forEach(
      (speech: Speech) => speech.expiresAt = speech.expiresAt.toLocaleString()
    )
    const json = JSON.stringify(status, undefined, 2)
    const resource = Buffer.from(json)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Content-Length', resource.byteLength)
    if (request.method === 'GET')
      response.write(resource)
  }

  [Symbol.dispose](): void {
    this.server.close()
    this.webClients.forEach((client: WebSocketClient) => client.close())
    this.webClients.clear()
    this.webSocket.close()
  }
}

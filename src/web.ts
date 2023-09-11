import { BackLog, BotInterface, replaceVariables } from '.'
import { IncomingMessage, Server, ServerResponse, createServer } from 'http'
import { createHash } from 'crypto'
import { join as joinPath } from 'path'
import { promisify } from 'util'
import { readFile, readdir } from 'fs'

type AsyncFunction = () => Promise<void>

type Speech = {
  content: Buffer
  expires: Date
}

export class Web implements Disposable {
  private readonly assets = new Map<string, Buffer>()
  private readonly server: Server
  private readonly speeches = new Map<string, Speech>()
  private readonly webPrefix: string

  constructor(private readonly bot: BotInterface) {
    this.server = createServer()
    this.server.on('request', this.handleHttp2Request.bind(this))
    this.server.listen(this.port)
    this.webPrefix = this.scheme + '://' + this.host
  }

  createSpeech(message: string, callback: (url: string) => void): void {
    const content = Buffer.from(message)
    const salt = Buffer.from(new Date().toISOString(), 'ascii')
    const sha256 = createHash('sha256')
    sha256.update(salt)
    sha256.update(content)
    const hash = sha256.digest().toString('hex')
    this.speeches.set(hash, { content, expires: new Date(Date.now() + 300000) })
    const url = this.webPrefix + '/logs/' + hash
    callback(url)
  }

  private async handleGetRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const routes = {
      '': this.respondRootAsync.bind(this, request, response),
      'health': this.respondHealthAsync.bind(this, request, response),
      'logs': this.respondLogAsync.bind(this, request, response),
      'messages': this.respondMessagesAsync.bind(this, request, response),
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

  get host(): string {
    return process.env.HOST ?? 'localhost'
  }

  async loadAssetsAsync(): Promise<void> {
    for (const name of await promisify(readdir)('assets')) {
      const data = await promisify(readFile)(joinPath('assets', name))
      this.assets.set(name, data)
    }
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

  private async respondLogAsync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { url } = request
    const names = url.split('/').slice(1)
    const name = names.at(1)
    if (this.speeches.has(name)) {
      const speech = this.speeches.get(name)
      const { content, expires } = speech
      const remaining = expires.getTime() - Date.now()
      if (remaining < 0) {
        this.speeches.delete(name)
        response.statusCode = 410
        response.setHeader('Location', '/')
      }
      else {
        setTimeout(this.speeches.delete.bind(this.speeches, name), remaining)
        response.setHeader('Content-Type', 'text/plain; charset=utf8')
        response.setHeader('Content-Length', content.byteLength)
        response.setHeader('Expires', expires.toUTCString())
        if (request.method === 'GET')
          response.write(content)
      }
    }
    else
      response.statusCode = 404
  }

  private async respondMessagesAsync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const list = (await this.bot.queryAsync('+', '-', { COUNT: 100 })).map((value: BackLog) => value.message.log)
    const buf = Buffer.from(JSON.stringify(list))
    response.statusCode = 200
    response.setHeader('Content-Length', buf.byteLength)
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'GET')
      response.write(buf)
  }

  private async respondRootAsync(_request: IncomingMessage, response: ServerResponse): Promise<void> {
    await this.respondAssetFileForUrlAsync('/main.html', response)
  }

  private async respondStatusAsync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const status = { backLogs: await this.bot.length, speeches: this.speeches.size }
    const json = JSON.stringify(status, undefined, 2)
    const resource = Buffer.from(json)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Content-Length', resource.byteLength)
    if (request.method === 'GET')
      response.write(resource)
  }

  get scheme(): string {
    return process.env.WEBSCHEME ?? 'https'
  }

  [Symbol.dispose](): void {
    this.server.close()
  }
}

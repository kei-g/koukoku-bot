import {
  Action,
  Injectable,
  KoukokuProxyService,
  PromiseList,
  Service,
  bindToReadAsJSON,
  suppress,
} from '..'
import { ClientRequest, IncomingMessage, OutgoingHttpHeaders } from 'http'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { request as createRequest } from 'https'

@Injectable({
  DependsOn: [
    KoukokuProxyService,
  ]
})
export class SpeechService implements Service {
  readonly #proxyService: KoukokuProxyService
  readonly #speeches = new Set<GitHubSpeechWithTimer>()

  #createRequest(method: 'DELETE' | 'POST', path: string, contentType?: string): ClientRequest {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'User-Agent': `Node.js ${process.version}`,
      'X-GitHub-Api-Version': '2022-11-28',
    } as OutgoingHttpHeaders
    if (contentType)
      headers['Content-Type'] = contentType
    return createRequest(
      {
        headers,
        host: 'api.github.com',
        method,
        path,
        protocol: 'https:',
      }
    )
  }

  #delete(id: string): Promise<number> {
    return new Promise(
      (resolve: Action<number>) => {
        const request = this.#createRequest('DELETE', `/gist/${id}`)
        request.on(
          'response',
          (response: IncomingMessage) => resolve(response.statusCode)
        )
        request.end()
      }
    )
  }

  constructor(
    proxyService: KoukokuProxyService
  ) {
    this.#proxyService = proxyService
  }

  async create(content: string, maxLength: number = 64, remark: boolean = true): Promise<GitHubSpeech> {
    const now = new Date()
    const salt = Buffer.from(now.toISOString(), 'ascii')
    const sha256 = createHash('sha256')
    sha256.update(salt)
    sha256.update(content)
    const hash = sha256.digest().toString('hex').slice(0, maxLength)
    const request = this.#createRequest('POST', '/gists', 'application/json')
    const obj = {
      description: '',
      files: {} as Record<string, { content: string }>,
      public: false,
    }
    const fileName = `${hash}.txt`
    obj.files[fileName] = { content }
    console.log(obj)
    const json = JSON.stringify(obj)
    const data = Buffer.from(json)
    const readAsJSON = bindToReadAsJSON<GitHubResponse>(request)
    console.log(`[speech] '\x1b[32m${json}\x1b[m' to ${request.host}${request.path}`)
    request.write(data)
    request.end()
    const response = await readAsJSON()
    if (isGitHubResponse(response)) {
      const { id } = response
      const { raw_url: url } = response.files[fileName]
      const speech = {
        content: content,
        expiresAt: new Date(now.getTime() + 3e6),
        id,
        timer: setTimeout(
          async () => {
            this.#speeches.delete(speech)
            await this.#delete(id)
          },
          3e6
        ),
        url,
      }
      this.#speeches.add(speech)
      if (remark)
        await this.#proxyService.post(url)
      return speech
    }
    else
      await this.#proxyService.post('[Bot] 大演説の生成に失敗しました')
  }

  async createFromFile(path: string): Promise<void> {
    const data = await readFile(path).catch(suppress)
    if (data) {
      const text = data.toString().trim()
      const time = Date.now().toString(16).slice(2, -2)
      await this.create(`[Bot@${time}] https://github.com/kei-g/koukoku-bot\n\n${text}`)
    }
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
    console.log('deleting gist...')
    await using list = new PromiseList()
    const speeches = [...this.#speeches]
    this.#speeches.clear()
    for (const speech of speeches) {
      clearTimeout(speech.timer)
      list.push(this.#delete(speech.id))
    }
  }
}

type GitHubResponse = {
  id: string
  files: Record<string, { raw_url: string }>
  url: string
}

type GitHubSpeech = {
  content: string
  expiresAt: Date | string
  id: string
  url: string
}

type GitHubSpeechWithTimer = GitHubSpeech & {
  timer: NodeJS.Timeout
}

const isGitHubResponse = (value: unknown): value is GitHubResponse =>
  !(typeof value === 'string' || value instanceof Error)
  && typeof value === 'object'
  && ['id', 'files', 'url'].every((key: string) => key in value)

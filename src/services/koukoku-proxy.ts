import {
  Injectable,
  KoukokuProxyPutResponse,
  KoukokuProxyResponse,
  Service,
  bindToReadAsJSON,
  parseIntOr,
} from '..'
import { ClientRequest, OutgoingHttpHeaders } from 'http'
import { request as createSecureRequest } from 'https'

@Injectable()
export class KoukokuProxyService implements Service {
  readonly #interval = new WeakMap<this, NodeJS.Timeout>()

  #createRequest(method: 'POST' | 'PUT', path: string, headers: OutgoingHttpHeaders = {}): ClientRequest {
    const { env, version } = process
    const { PROXY_HOST } = env
    headers.host = PROXY_HOST
    headers['user-agent'] = `Node.js ${version}`
    return createSecureRequest(
      {
        headers,
        host: PROXY_HOST,
        method,
        path,
        protocol: 'https:',
      }
    )
  }

  #ping(): Promise<Error | KoukokuProxyResponse> {
    return this.#post<KoukokuProxyResponse>('/ping')
  }

  #post<T>(path: string, payload: Buffer | string = '', headers: OutgoingHttpHeaders = {}): Promise<Error | T> {
    const data = typeof payload === 'string' ? Buffer.from(payload) : payload
    const { byteLength } = data
    headers['content-length'] = byteLength
    headers['content-type'] ??= 'text/plain; charset=utf-8'
    const request = this.#createRequest('POST', path, headers)
    const readAsJSON = bindToReadAsJSON<T>(request)
    if (byteLength) {
      const { host, path } = request
      typeof payload === 'string'
        ? console.log(`[proxy] send '\x1b[32m${payload}\x1b[m' to ${host}${path}`)
        : console.log(`[proxy] send \x1b[33m${byteLength}\x1b[m bytes to ${host}${path}`)
    }
    request.write(data)
    request.end()
    return readAsJSON()
  }

  constructor() {
  }

  post(text: string): Promise<Error | KoukokuProxyResponse>
  post(content: string, maxLength: number, remark: boolean): Promise<Error | KoukokuProxyPutResponse>
  post(content: string, maxLength?: number, remark?: boolean): Promise<Error | KoukokuProxyResponse | KoukokuProxyPutResponse> {
    const index = +(maxLength === undefined)
    const { PROXY_TOKEN } = process.env
    return this.#post<KoukokuProxyResponse>(
      ['/speech', '/say'][index],
      [JSON.stringify({ content, maxLength, remark }), content][index],
      {
        authorization: `TOKEN ${PROXY_TOKEN}`,
        'content-type': ['application/json', undefined][index],
      }
    )
  }

  async start(): Promise<void> {
    const ms = parseIntOr(process.env.PROXY_PING_INTERVAL, 120000)
    const interval = setInterval(this.#ping.bind(this), ms)
    this.#interval.set(this, interval)
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const interval = this.#interval.get(this)
    clearInterval(interval)
  }
}

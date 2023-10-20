import {
  Injectable,
  KoukokuProxyResponse,
  Service,
  bindToReadAsJSON,
  parseIntOr,
} from '..'
import { OutgoingHttpHeaders } from 'http'
import { request as createSecureRequest } from 'https'

@Injectable()
export class KoukokuProxyService implements Service {
  readonly #interval = new WeakMap<this, NodeJS.Timeout>()

  #ping(): Promise<Error | KoukokuProxyResponse> {
    return this.#post('/ping')
  }

  #post(path: string, payload: string = '', headers: OutgoingHttpHeaders = {}): Promise<Error | KoukokuProxyResponse> {
    const data = Buffer.from(payload)
    const { env, version } = process
    const { PROXY_HOST } = env
    headers.host = PROXY_HOST
    headers['user-agent'] = `Node.js ${version}`
    const request = createSecureRequest(
      {
        headers,
        host: PROXY_HOST,
        method: 'POST',
        path,
        protocol: 'https:',
      }
    )
    const readAsJSON = bindToReadAsJSON<KoukokuProxyResponse>(request)
    if (payload) {
      const { host, path } = request
      console.log(`[proxy] send '\x1b[32m${payload}\x1b[m' to ${host}${path}`)
    }
    request.write(data)
    request.end()
    return readAsJSON()
  }

  constructor() {
  }

  post(text: string): Promise<Error | KoukokuProxyResponse> {
    const { HOST, PROXY_TOKEN } = process.env
    return this.#post(
      `/from/${encodeURI(HOST)}`,
      text,
      {
        authorization: `TOKEN ${PROXY_TOKEN}`,
        'content-type': 'text/plain; charset=utf-8',
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

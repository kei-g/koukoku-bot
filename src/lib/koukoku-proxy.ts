import { ProxyResponse, receiveAsJsonAsync } from '..'
import { request as createRequest } from 'https'

export namespace KoukokuProxy {
  export const pingAsync = (): Promise<Error | ProxyResponse> => {
    const { PROXY_HOST } = process.env
    const request = createRequest(
      {
        headers: {
          'Host': PROXY_HOST,
          'User-Agent': `Node.js ${process.version}`,
        },
        host: PROXY_HOST,
        method: 'POST',
        path: '/ping',
        protocol: 'https:',
      }
    )
    return receiveAsJsonAsync<ProxyResponse>(request, Buffer.from(''))
  }

  export const sendAsync = (text: string): Promise<Error | ProxyResponse> => {
    const data = Buffer.from(text)
    const { HOST, PROXY_HOST, PROXY_TOKEN } = process.env
    const request = createRequest(
      {
        headers: {
          Authorization: `TOKEN ${PROXY_TOKEN}`,
          'Content-Type': 'text/plain; charset=utf-8',
          'Host': PROXY_HOST,
          'User-Agent': `Node.js ${process.version}`,
        },
        host: PROXY_HOST,
        method: 'POST',
        path: `/from/${encodeURI(HOST)}`,
        protocol: 'https:',
      }
    )
    return receiveAsJsonAsync<ProxyResponse>(request, data)
  }
}

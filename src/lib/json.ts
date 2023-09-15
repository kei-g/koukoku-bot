import { ClientRequest, IncomingMessage } from 'http'
import { bind1st } from '..'

export class TimeoutError extends Error {
  constructor() {
    super('request timeout')
  }
}

const doReceive = <T>(resolve: (value: Error | T | string) => void, response: IncomingMessage) => {
  const contentType = response.headers['content-type']
  const list = [] as Buffer[]
  response.on('data', list.push.bind(list))
  response.on(
    'end',
    () => {
      const text = Buffer.concat(list).toString()
      resolve(contentType?.startsWith('application/json') ? JSON.parse(text) as T : text)
    }
  )
}

export const receiveAsJsonAsync = async <T>(request: ClientRequest, content: Buffer): Promise<Error | T | string> => {
  const task = new Promise(
    (resolve: (value: Error | T | string) => void) => {
      request.on('error', (error: Error) => resolve(error))
      request.on('timeout', () => resolve(new TimeoutError()))
      request.on('response', bind1st(resolve, doReceive))
    }
  )
  process.stdout.write(`send '\x1b[32m${content.toString()}\x1b[m' to ${request.host}${request.path}\n`)
  request.write(content)
  request.end()
  const response = await task
  if (response instanceof Error)
    process.stderr.write(`[${request.host}] '\x1b[31m${response.message}\x1b[m'\n`)
  else if (typeof response === 'string')
    process.stdout.write(`[${request.host}] '\x1b[32m${response}\x1b[m'\n`)
  else if (typeof response === 'object')
    process.stdout.write(`[${request.host}] ${JSON.stringify(response)}\n`)
  return response
}

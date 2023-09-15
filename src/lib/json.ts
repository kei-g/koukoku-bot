import { ClientRequest, IncomingMessage } from 'http'
import { bind1st } from '..'

const concatenateBuffers = <T>(resolve: (value: Error | T | string) => void, response: IncomingMessage) => {
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
  response.on('error', resolve)
}

const debug = <T>(host: string, value: Error | T | string): void => {
  if (value instanceof Error)
    process.stderr.write(`[${host}] '\x1b[31m${value.message}\x1b[m'\n`)
  else if (typeof value === 'string')
    process.stdout.write(`[${host}] '\x1b[32m${value}\x1b[m'\n`)
  else if (typeof value === 'object')
    process.stdout.write(`[${host}] ${JSON.stringify(value)}\n`)
}

export const receiveAsJsonAsync = async <T>(request: ClientRequest, content: Buffer): Promise<Error | T | string> => {
  const task = new Promise(
    (resolve: (value: Error | T | string) => void) => {
      request.on('error', resolve)
      request.on('response', bind1st(resolve, concatenateBuffers))
    }
  )
  process.stdout.write(`send '\x1b[32m${content.toString()}\x1b[m' to ${request.host}${request.path}\n`)
  request.write(content)
  request.end()
  const response = await task
  debug(request.host, response)
  return response
}

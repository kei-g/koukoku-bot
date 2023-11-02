import { Action, bind1st } from '..'
import { ClientRequest, IncomingMessage } from 'http'

class UnexpectedContentTypeError extends Error {
  constructor(readonly contentType: string, readonly text: string) {
    super(`unexpected content type, ${contentType}`)
  }
}

const concatenateBuffers = <T>(resolve: (value: Error | T) => void, response: IncomingMessage) => {
  const contentType = response.headers['content-type']
  const list = [] as Buffer[]
  response.on('data', list.push.bind(list))
  response.on(
    'end',
    () => {
      const text = Buffer.concat(list).toString()
      resolve(
        contentType?.startsWith('application/json')
          ? JSON.parse(text) as T
          : new UnexpectedContentTypeError(contentType, text)
      )
    }
  )
  response.on('error', resolve)
}

const debug = async <T>(host: string, value: Error | T): Promise<void> => {
  if (value instanceof Error)
    await writeAsync(`[${host}] '\x1b[31m${value.message}\x1b[m'\n`)
  else if (typeof value === 'object') {
    await writeAsync(`[${host}] `)
    console.dir(value, { colors: true, depth: null, maxArrayLength: null })
  }
}

export const receiveAsJsonAsync = async <T>(request: ClientRequest, content: Buffer): Promise<Error | T> => {
  const task = new Promise(
    (resolve: (value: Error | T) => void) => {
      request.on('error', resolve)
      request.on('response', bind1st(resolve, concatenateBuffers))
    }
  )
  await writeAsync(`send '\x1b[32m${content.toString()}\x1b[m' to ${request.host}${request.path}\n`)
  request.write(content)
  request.end()
  const response = await task
  await debug(request.host, response)
  return response
}

const writeAsync = (buffer: Uint8Array | string) => new Promise(
  (resolve: Action<Error | void>) => process.stdout.write(buffer, resolve)
)

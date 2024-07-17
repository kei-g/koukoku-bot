import type { Action } from '..'
import type { ClientRequest, IncomingMessage } from 'http'

class UnexpectedContentTypeError extends Error {
  readonly text: string

  constructor(readonly contentType: string, text: string) {
    super(`unexpected content type, ${contentType}`)
    this.text = text
  }
}

const bind1st = <A1, O extends unknown[], R>(arg: A1, func: (_arg: A1, ..._args: O) => R) => (...args: O) => func(arg, ...args)

export const bindToReadAsJSON = <T>(request: ClientRequest) => {
  const job = new Promise(
    (resolve: Action<Error | T>) => {
      request.on('error', resolve)
      request.on('response', bind1st(resolve, concatenateBuffers))
    }
  )
  return async () => {
    const response = await job
    await debug(request.host, response)
    return response
  }
}

const concatenateBuffers = <T>(resolve: Action<Error | T>, response: IncomingMessage): void => {
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

const writeAsync = (buffer: Uint8Array | string) => new Promise(
  (resolve: Action<Error | void>) => process.stdout.write(buffer, resolve)
)

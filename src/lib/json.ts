import { ClientRequest, IncomingMessage } from 'http'
import { bind1st } from '..'

const concatenateBuffers = <T>(resolve: (value: T) => void, response: IncomingMessage) => {
  const list = [] as Buffer[]
  response.on('data', list.push.bind(list))
  response.on('end', () => resolve(JSON.parse(Buffer.concat(list).toString()) as T))
}

export const receiveAsJsonAsync = <T>(request: ClientRequest, content: Buffer): Promise<T> => {
  const task = new Promise((resolve: (value: T) => void) => request.on('response', bind1st(resolve, concatenateBuffers)))
  request.write(content)
  request.end()
  return task
}

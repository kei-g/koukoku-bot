import type { Service } from '.'
import { isService } from '.'

export interface CommandService extends Service {
  execute(_matched: RegExpMatchArray, _rawMessage: string): Promise<void>
  match(_message: string): RegExpMatchArray
}

export const isCommandService = (value: unknown): value is CommandService => {
  const service = value as CommandService
  return isService(value) && typeof service.execute === 'function' && typeof service.match === 'function'
}

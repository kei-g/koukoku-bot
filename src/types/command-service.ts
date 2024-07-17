import type { Service } from '.'
import { isService } from '.'

export interface CommandService extends Service {
  execute(matched: RegExpMatchArray, rawMessage: string): Promise<void>
  match(message: string): RegExpMatchArray
}

export const isCommandService = (value: unknown): value is CommandService => {
  const service = value as CommandService
  return isService(value) && typeof service.execute === 'function' && typeof service.match === 'function'
}

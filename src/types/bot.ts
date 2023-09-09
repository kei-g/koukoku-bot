import { EventEmitter } from 'stream'
import { Log } from '.'
import { RedisCommandArgument } from '@redis/client/dist/lib/commands'

/**
 *
 */
export interface BotInterface {
  /**
   *
   */
  get length(): Promise<number>

  /**
   *
   * @param target
   */
  observe(target: EventEmitter): void

  /**
   *
   */
  queryAsync(start: RedisCommandArgument, end: RedisCommandArgument, options?: { COUNT?: number }): Promise<Log[]>
}

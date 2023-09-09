import { BackLog } from '.'
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
   * @param buffers
   *
   * @param resolve
   */
  post(buffers: Buffer[], resolve: () => void): void

  /**
   *
   */
  queryAsync(start: RedisCommandArgument, end: RedisCommandArgument, options?: { COUNT?: number }): Promise<BackLog[]>
}

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
   * @param send
   */
  notifyWebClient(send: (data: BackLog[]) => void): void

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
  queryLogAsync(start: RedisCommandArgument, end: RedisCommandArgument, options?: { COUNT?: number }): Promise<BackLog[]>

  get speeches(): Speech[]
}

export type Speech = {
  content: string
  expiresAt: Date | string
  id: string
  url: string
}

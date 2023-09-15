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
   * @param send
   */
  notifyWebClient(send: (data: Log[]) => void): void

  /**
   *
   * @param buffers
   *
   * @param resolve
   */
  postAsync(buffers: Buffer[], resolve: () => void): Promise<void>

  /**
   *
   */
  queryLogAsync(start: RedisCommandArgument, end: RedisCommandArgument, options?: { COUNT?: number }): Promise<Log[]>

  get speeches(): Speech[]
}

export type Speech = {
  content: string
  expiresAt: Date | string
  id: string
  url: string
}

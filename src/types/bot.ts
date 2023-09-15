import { EventEmitter } from 'stream'
import { Log } from '.'

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
  notifyWebClient(send: (data: Log[]) => Promise<void>): Promise<void>

  /**
   *
   * @param target
   */
  observe(target: EventEmitter): void

  /**
   *
   */
  get speeches(): Speech[]
}

export type Speech = {
  content: string
  expiresAt: Date | string
  id: string
  url: string
}

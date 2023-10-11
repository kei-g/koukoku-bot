import { EventEmitter } from 'stream'
import { GitHubSpeech, Log, RedisStreamItem, Speech } from '.'

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
  notifyWebClient(send: (data: (RedisStreamItem<Log> | RedisStreamItem<Speech>)[]) => Promise<void>): Promise<void>

  /**
   *
   * @param target
   */
  observe(target: EventEmitter): void

  /**
   *
   */
  get speeches(): GitHubSpeech[]
}

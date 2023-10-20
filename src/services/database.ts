import {
  Injectable,
  RedisStreamItem,
  Service,
} from '..'
import { RedisClientType, createClient } from '@redis/client'
import { RedisCommandArgument } from '@redis/client/dist/lib/commands'

@Injectable()
export class DatabaseService implements Service {
  readonly #client: RedisClientType

  constructor() {
    this.#client = createClient(
      {
        pingInterval: 15000,
        url: process.env.REDIS_URL,
      }
    )
  }

  get(key: RedisCommandArgument): Promise<string> {
    return this.#client.get(key)
  }

  async hDel(key: RedisCommandArgument, field: RedisCommandArgument): Promise<boolean> {
    const number = await this.#client.hDel(key, field)
    return 0 < number
  }

  hGetAll(key: RedisCommandArgument): Promise<Record<string, string>> {
    return this.#client.hGetAll(key)
  }

  hKeys(key: RedisCommandArgument): Promise<string[]> {
    return this.#client.hKeys(key)
  }

  hSetNX(key: RedisCommandArgument, field: RedisCommandArgument, value: RedisCommandArgument): Promise<boolean> {
    return this.#client.hSetNX(key, field, value)
  }

  hmGet(key: RedisCommandArgument, ...fields: RedisCommandArgument[]): Promise<string[]> {
    return this.#client.hmGet(key, fields)
  }

  set(key: RedisCommandArgument, value: RedisCommandArgument): Promise<string> {
    return this.#client.set(key, value)
  }

  async start(): Promise<void> {
    await this.#client.connect()
  }

  xAdd(key: RedisCommandArgument, message: Record<string, string>): Promise<string>
  xAdd(key: RedisCommandArgument, id: string, message: Record<string, string>): Promise<void>
  async xAdd(key: RedisCommandArgument, arg1: Record<string, string> | string, arg2?: Record<string, string>): Promise<string | void> {
    if (typeof arg1 === 'string')
      await this.#client.xAdd(key, arg1, arg2)
    else
      return await this.#client.xAdd(key, '*', arg1)
  }

  async xRevRange<T extends Record<string, string>>(key: RedisCommandArgument, start: RedisCommandArgument, end: RedisCommandArgument, count?: number): Promise<RedisStreamItem<T>[]> {
    const opts = {} as { COUNT: number }
    if (typeof count === 'number')
      opts.COUNT = count
    const response = await this.#client.xRevRange(key, start, end, opts)
    return response as RedisStreamItem<T>[]
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#client.disconnect()
  }
}

import {
  Injectable,
} from '..'

import type {
  RedisStreamItem,
  Service,
} from '..'

import type { RedisClientType } from '@redis/client'
import { createClient } from '@redis/client'

type RedisCommandArgument = string

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

  async get(key: RedisCommandArgument): Promise<string> {
    const result = await this.#client.get(key)
    if (typeof result === 'string')
      return result
  }

  async hDel(key: RedisCommandArgument, field: RedisCommandArgument): Promise<boolean> {
    const number = await this.#client.hDel(key, field)
    return 0 < number
  }

  hGetAll(key: RedisCommandArgument): Promise<Record<string, { toString: {} }>> {
    return this.#client.hGetAll(key)
  }

  hKeys(key: RedisCommandArgument): Promise<string[]> {
    return this.#client.hKeys(key)
  }

  async hSetNX(key: RedisCommandArgument, field: RedisCommandArgument, value: RedisCommandArgument): Promise<boolean> {
    return await this.#client.hSetNX(key, field, value) === 1
  }

  hmGet(key: RedisCommandArgument, ...fields: RedisCommandArgument[]): Promise<(string | {})[]> {
    return this.#client.hmGet(key, fields)
  }

  async set(key: RedisCommandArgument, value: RedisCommandArgument): Promise<string> {
    const result = await this.#client.set(key, value)
    if (typeof result === 'string')
      return result
  }

  async start(): Promise<void> {
    await this.#client.connect()
  }

  xAdd(_key: RedisCommandArgument, _message: Record<string, string>): Promise<string>
  xAdd(_key: RedisCommandArgument, _id: string, _message: Record<string, string>): Promise<string>
  async xAdd(key: RedisCommandArgument, arg1: Record<string, string> | string, arg2?: Record<string, string>): Promise<string> {
    return await (
      typeof arg1 === 'string'
        ? this.#client.xAdd(key, arg1, arg2)
        : this.#client.xAdd(key, '*', arg1)
    )
  }

  async xRange<T extends Record<string, string>>(key: RedisCommandArgument, start: RedisCommandArgument, end: RedisCommandArgument, count?: number): Promise<RedisStreamItem<T>[]> {
    const opts = {} as { COUNT: number }
    if (typeof count === 'number')
      opts.COUNT = count
    const response = await this.#client.xRange(key, start, end, opts)
    return response as RedisStreamItem<T>[]
  }

  async xRevRange<T extends Record<string, string>>(key: RedisCommandArgument, start: RedisCommandArgument, end: RedisCommandArgument, count?: number): Promise<RedisStreamItem<T>[]> {
    const opts = {} as { COUNT: number }
    if (typeof count === 'number')
      opts.COUNT = count
    const response = await this.#client.xRevRange(key, start, end, opts)
    return response as RedisStreamItem<T>[]
  }

  zAdd(key: RedisCommandArgument, score: number, value: string): Promise<number> {
    return this.#client.zAdd(key, { score, value })
  }

  zCard(key: RedisCommandArgument): Promise<number> {
    return this.#client.zCard(key)
  }

  zRangeByScoreWithScores(key: RedisCommandArgument, range: { max: number, min: number }): Promise<{ score: number, value: string }[]> {
    return this.#client.zRangeByScoreWithScores(key, range.min, range.max)
  }

  zRangeWithScores(key: RedisCommandArgument, range: { max: number, min: number }): Promise<{ score: number, value: string }[]> {
    return this.#client.zRangeWithScores(key, range.min, range.max)
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#client.destroy()
    await Promise.resolve()
  }
}

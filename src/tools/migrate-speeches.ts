import { createClient } from '@redis/client'

type RedisStreamItem = {
  id: string
  message: Record<string, string>
  score: number
}

export const migrateSpeeches = async () => {
  const db = createClient({ url: 'redis://localhost' })
  await db.connect()
  const items = [] as RedisStreamItem[]
  const estimated = `${Date.now()}`
  console.log('\x1b[42mLoading logs...\x1b[m')
  for (const item of await db.xRange('koukoku:log', '-', '+')) {
    const { id, message } = item
    const [key] = id.split('-')
    const score = parseInt(key)
    if ('hash' in message) {
      const { body, date, hash, host, time } = message
      const length = [body, date, host].join('').length + body.split(/\r?\n/).length * 10 + 110
      const finished = score - 125
      items.push(
        {
          id,
          message: {
            body,
            date,
            estimated,
            finished: `${finished}`,
            hash,
            host,
            time,
          },
          score: finished - length * 43,
        }
      )
    }
    else
      items.push({ id, message, score })
  }
  console.log('👌')
  await db.del('koukoku:timestamp')
  await db.rename('koukoku:log', 'temp')
  console.log('\x1b[42mSaving logs...\x1b[m')
  for (const { id: value, message, score } of items) {
    await db.xAdd('koukoku:log', value, message)
    await db.zAdd('koukoku:timestamp', { score, value })
  }
  console.log('🙆')
  db.destroy()
}

migrateSpeeches()

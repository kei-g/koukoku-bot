import { createClient } from '@redis/client'

const decompose = (text: string) => {
  for (const matched of text.matchAll(messageRE)) {
    const { groups } = matched
    const item = {} as Record<string, string>
    for (const key in groups) {
      const value = groups[key]
      if (!(value === undefined))
        item[key] = value
    }
    return item
  }
}

const main = async () => {
  const db = createClient({ url: 'redis://localhost' })
  await db.connect()
  await db.rename('koukoku:log', 'temp')
  for (const item of await db.xRange('temp', '-', '+')) {
    const { id, message } = item
    await db.xAdd(
      'koukoku:log',
      id,
      'log' in message ? decompose(message.log) : message
    )
  }
  await db.disconnect()
}

const messageRE = />>\s「\s(?<body>[^」]+(?=\s」))\s」\(チャット放話\s-\s(?<date>\d\d\/\d\d)\s\((?<dow>[日月火水木金土])\)\s(?<time>\d\d:\d\d:\d\d)\sby\s(?<host>[^\s]+)(\s\((?<forgery>※\s贋作\sDNS\s逆引の疑い)\))?\s君(\s(?<self>〈＊あなた様＊〉))?\)\s<</g

main().catch(
  (error: unknown) => console.error({ error })
)

import { decode, encode } from 'iconv-lite'
import { isDeepStrictEqual } from 'util'

export namespace Unicode {
  export const escape = (text: string, encoding: string = 'sjis') => {
    const list = [] as string[]
    for (const c of text) {
      const b = Buffer.from(c)
      const e = encode(c, encoding)
      const d = Buffer.from(decode(e, encoding))
      list.push(isDeepStrictEqual(b, d) ? c : [...b].map(convertToString).join(''))
    }
    return list.join('')
  }
}

const convertToString = (v: number) => `％${('0' + v.toString(16)).slice(-2)}`

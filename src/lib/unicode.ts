import { encode } from 'iconv-lite'

export namespace Unicode {
  export const escape = (text: string) => encode(text, 'ucs-4', { addBOM: false, stripBOM: true }).reverse().reduce(doReduce, [0]).slice(1).reverse().map(convertToString).join('')
}

const convertToString = (v: number) => v in wellknown ? '\\' + wellknown[v] : v < 256 ? '\\x' + ('0' + v.toString(16)).slice(-2) : '\\u' + v.toString(16).toUpperCase()

const doReduce = (m: number[], c: number, i: number) => i & 3 ? (m[m.length - 1] += c * [0, 65536, 256, 1][i & 3], m) : m.concat(c)

const wellknown = {
  7: 'a',
  8: 'b',
  9: 't',
  10: 'n',
  11: 'v',
  12: 'c',
  13: 'r',
} as Record<number, string>

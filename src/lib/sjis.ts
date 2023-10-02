import { readFile } from 'fs/promises'

export namespace SJIS {
  export const decode = async (data: Buffer): Promise<string> => {
    await getReverseCodeMapAsync()
    const ctx = { i: 0, text: '' } as { i: number, text: string }
    while (ctx.i < data.byteLength)
      await decodeSingle(ctx, data)
    return ctx.text
  }

  export const encode = async (text: string): Promise<Buffer> => Buffer.concat(await Promise.all([...text].map(encodeSingle)))

  export const escape = async (text: string): Promise<string> => {
    const codeMap = await getCodeMapAsync()
    return [...text].map((c: string) => c in codeMap ? c : encodeURI(c).replaceAll('%', '％')).join('')
  }
}

const codeMap = {} as Record<string, number[]>

const decodeSingle = async (ctx: { i: number, text: string }, data: Buffer): Promise<void> => {
  const b1 = data[ctx.i++]
  const c1 = reverseCodeMap[b1]
  if (c1 === undefined)
    await Promise.reject(new Error(`'${toHexString(b1)}' is inappropriate sequence as ShiftJIS`))
  else if (typeof c1 === 'object') {
    const b2 = data[ctx.i++]
    const c2 = c1[b2]
    if (c2 === undefined)
      await Promise.reject(new Error(`'${toHexString(b1, b2)}' is inappropriate sequence as ShiftJIS`))
    ctx.text += c2
  }
  else
    ctx.text += c1
}

const encodeSingle = (c: string): Promise<Buffer> => c in codeMap ? Promise.resolve(Buffer.of(...codeMap[c])) : Promise.reject(new Error(`'${c}' is inappropriate sequence as ShiftJIS`))

const getCodeMapAsync = async (): Promise<Record<string, number[]>> => {
  for (const _ in codeMap)
    return codeMap
  const data = await readFile('conf/sjis.json')
  const source = JSON.parse(data.toString()) as Record<string, number[]>
  for (const key in source)
    codeMap[key] = source[key]
  return codeMap
}

const getReverseCodeMapAsync = async (): Promise<void> => {
  for (const _ in reverseCodeMap)
    return
  const codeMap = await getCodeMapAsync()
  for (const c in codeMap) {
    const data = codeMap[c]
    if (data.length < 2)
      reverseCodeMap[data[0]] = c
    else {
      reverseCodeMap[data[0]] ??= {}
      const record = reverseCodeMap[data[0]] as Record<number, string>
      record[data[1]] = c
    }
  }
}

const reverseCodeMap = {} as Record<number, Record<number, string> | string>

const toHexString = (...values: number[]): string => values.map((v: number) => ('0' + v.toString(16)).slice(-2)).join('')

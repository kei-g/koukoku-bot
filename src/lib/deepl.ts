import { DeepLResult, bindToReadAsJSON } from '..'
import { request as createRequest } from 'https'

export namespace DeepL {
  export class LanguageMap {
    private readonly codes = new Map<string, string>()
    private readonly names = new Map<string, string>()

    constructor() {
      for (const key in languages) {
        const value = languages[key as keyof TypeOfLanguage]
        this.codes.set(key, value)
        this.names.set(value, key)
      }
    }

    getCode(name: string): string {
      return this.names.get(name)
    }

    getName(code?: string): string {
      return this.codes.get(code?.toLowerCase())
    }
  }

  type TypeOfLanguage = {
    bg: 'ブルガリア語'
    cs: 'チェコ語'
    da: 'デンマーク語'
    de: 'ドイツ語'
    el: 'ギリシャ語'
    en: '英語'
    es: 'スペイン語'
    et: 'エストニア語'
    fi: 'フィンランド語'
    fr: 'フランス語'
    hu: 'ハンガリー語'
    id: 'インドネシア語'
    it: 'イタリア語'
    ja: '日本語'
    ko: '韓国語'
    lt: 'リトアニア語'
    lv: 'ラトビア語'
    nb: 'ノルウェー語'
    nl: 'オランダ語'
    pl: 'ポーランド語'
    pt: 'ポルトガル語'
    ro: 'ルーマニア語'
    ru: 'ロシア語'
    sk: 'スロバキア語'
    sl: 'スロベニア語'
    sv: 'スウェーデン語'
    tr: 'トルコ語'
    uk: 'ウクライナ語'
    zh: '中国語'
  }

  export const languages = {
    bg: 'ブルガリア語',
    cs: 'チェコ語',
    da: 'デンマーク語',
    de: 'ドイツ語',
    el: 'ギリシャ語',
    en: '英語',
    es: 'スペイン語',
    et: 'エストニア語',
    fi: 'フィンランド語',
    fr: 'フランス語',
    hu: 'ハンガリー語',
    id: 'インドネシア語',
    it: 'イタリア語',
    ja: '日本語',
    ko: '韓国語',
    lt: 'リトアニア語',
    lv: 'ラトビア語',
    nb: 'ノルウェー語',
    nl: 'オランダ語',
    pl: 'ポーランド語',
    pt: 'ポルトガル語',
    ro: 'ルーマニア語',
    ru: 'ロシア語',
    sk: 'スロバキア語',
    sl: 'スロベニア語',
    sv: 'スウェーデン語',
    tr: 'トルコ語',
    uk: 'ウクライナ語',
    zh: '中国語',
  } as TypeOfLanguage

  const mayBeAssumedAsEnglish = (text: string): boolean => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i)
      if (128 <= c)
        return false
    }
    return true
  }

  export const translateAsync = async (text: string, lang?: string): Promise<DeepLResult | Error> => {
    const obj = {
      target_lang: lang ?? (mayBeAssumedAsEnglish(text) ? 'JA' : 'EN'),
      text: [text],
    }
    const json = JSON.stringify(obj)
    const content = Buffer.from(json)
    const request = createRequest(
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_AUTH_KEY}`,
          'Content-Length': content.byteLength,
          'Content-Type': 'application/json',
          Host: 'api-free.deepl.com',
        },
        host: 'api-free.deepl.com',
        method: 'POST',
        path: '/v2/translate',
        protocol: 'https:',
      }
    )
    const readAsJSON = bindToReadAsJSON<DeepLResult>(request)
    process.stdout.write(`send '\x1b[32m${json}\x1b[m' to ${request.host}${request.path}\n`)
    request.write(content)
    request.end()
    return await readAsJSON()
  }
}

export namespace DeepL {
  export type LanguageCode = keyof typeof languages

  export class LanguageMap {
    private readonly codes = new Map<string, LanguageCode>()
    private readonly names = new Map<LanguageCode, string>()

    constructor() {
      for (const key in languages) {
        const code = key as LanguageCode
        const name = languages[code]
        this.codes.set(name, code)
        this.names.set(code, name)
      }
    }

    getCode(name: string): LanguageCode {
      return this.codes.get(name)
    }

    getName(code?: LanguageCode): string {
      return this.names.get(code?.toLowerCase() as LanguageCode)
    }
  }

  const languages = {
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
  } as const
}

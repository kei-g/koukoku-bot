import type {
  CommandService,
  DeepLError,
  DeepLResult,
} from '..'

import {
  DeepL,
  Injectable,
  KoukokuProxyService,
  SJIS,
  SpeechService,
  bindToReadAsJSON,
  isDeepLError,
} from '..'

import { request as createSecureRequest } from 'https'

@Injectable({
  DependsOn: [
    KoukokuProxyService,
    SpeechService,
  ]
})
export class DeepLService implements CommandService {
  readonly #languageMap = new DeepL.LanguageMap()
  readonly #proxyService: KoukokuProxyService
  readonly #regexp = /^翻訳\s((?<command>--(help|lang))|((?<lang>bg|cs|da|de|e[lnst]|fi|fr|hu|id|[ilp]t|ja|ko|lv|nb|[nps]l|ro|ru|sk|sv|tr|uk|zh)\s)?(?<text>[\S\s]+))$/i
  readonly #speechService: SpeechService

  async #execute(lang: string | undefined, matched: RegExpMatchArray): Promise<void> {
    //const source = matched.groups?.text?.replaceAll(/(\s%\s?|%\s)/g, '%')
    const source = trimWhitespacesArroundPercent(matched, 'text')
    if (source) {
      const to = this.#qualifyLangName(lang)
      const r = await this.translate(decodeURI(source), lang)
      if (isDeepLError(r))
        await this.complain(r)
      else
        for (const t of r.translations) {
          const from = this.#languageMap.getName(t.detected_source_language)
          const escaped = await SJIS.escape(t.text.replaceAll(/\r?\n/g, '').trim())
          await this.#proxyService.post(`[Bot] (${from}から${to}翻訳) ${escaped}`)
        }
    }
    else
      await this.complain(new Error('本文がありません'))
  }

  #qualifyLangName(lang: string | undefined): string {
    return this.#languageMap.getName(lang as DeepL.LanguageCode)?.concat('に') ?? ''
  }

  constructor(
    proxyService: KoukokuProxyService,
    speechService: SpeechService
  ) {
    this.#proxyService = proxyService
    this.#speechService = speechService
  }

  async complain(error: DeepLError | Error): Promise<void> {
    await this.#proxyService.post(`[Bot] 翻訳エラー, ${error.message}`)
  }

  async execute(matched: RegExpMatchArray): Promise<void> {
    const { command, lang } = matched.groups
    const name = command?.slice(2)?.toLowerCase()
    await (name ? this.#speechService.createFromFile(`templates/translation/${name}.txt`) : this.#execute(lang, matched))
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  async start(): Promise<void> {
  }

  async translate(text: string, lang?: string): Promise<DeepLResult | Error> {
    const obj = {
      text: [text],
      target_lang: lang ?? (mayBeAssumedAsEnglish(text) ? 'JA' : 'EN')
    }
    const json = JSON.stringify(obj)
    const data = Buffer.from(json)
    const host = 'api-free.deepl.com'
    const request = createSecureRequest(
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_AUTH_KEY}`,
          'Content-Length': data.byteLength,
          'Content-Type': 'application/json',
          Host: host,
        },
        host,
        method: 'POST',
        path: '/v2/translate',
        protocol: 'https:',
      }
    )
    const readAsJSON = bindToReadAsJSON<DeepLResult>(request)
    console.log(`[deepL] '\x1b[32m${json}\x1b[m' to ${request.host}${request.path}`)
    request.write(data)
    request.end()
    return await readAsJSON()
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

const mayBeAssumedAsEnglish = (text: string): boolean => [...text].every(
  (_c: string, i: number) => text.charCodeAt(i) < 128
)

const trimWhitespacesArroundPercent = (matched: RegExpMatchArray, key: string) => matched.groups?.[key].replaceAll(/(\s%\s?|%\s)/g, '%')

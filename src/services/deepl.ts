import {
  CommandService,
  DeepL,
  DeepLError,
  DeepLResult,
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
  readonly #regexp = /^翻訳\s+((?<command>--(help|lang))$|((?<lang>bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh|bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh)\s+)?)/i
  readonly #speechService: SpeechService

  async #execute(lang: string | undefined, matched: RegExpMatchArray): Promise<void> {
    const { index, input } = matched
    // XXX: NOTE - This circumlocutory implementation is intended to avoid warnings by CodeQL analysis.
    // readonly #regexp = /^翻訳\s+((?<command>--(help|lang))|((?<lang>bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh|bg|cs|da|de|el|en|es|et|fi|fr|hu|id|it|ja|ko|lt|lv|nb|nl|pl|pt|ro|ru|sk|sl|sv|tr|uk|zh)\s+)?(?<text>.+))$/i
    // Equivalent to matched.groups.text.replaceAll(/\s*%\s*/g, '%')
    const source = input?.slice(index + matched[0].length)?.split('%')?.map((c: string) => c.trim())?.join('%')
    if (source) {
      const to = this.#languageMap.getName(lang as DeepL.LanguageCode)?.concat('に') ?? ''
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

import { DeepLResult, receiveAsJsonAsync } from '..'
import { request as createRequest } from 'https'

export namespace DeepL {
  const mayBeAssumedAsEnglish = (text: string): boolean => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i)
      if (128 <= c)
        return false
    }
    return true
  }

  export const translateAsync = async (text: string, lang?: string): Promise<DeepLResult> => {
    const content = Buffer.from(JSON.stringify({ text: [text], target_lang: lang ?? (mayBeAssumedAsEnglish(text) ? 'JA' : 'EN') }))
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
    return await receiveAsJsonAsync(request, content)
  }
}

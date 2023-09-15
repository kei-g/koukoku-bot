export type DeepLError = {
  message: string
}

export type DeepLResult = DeepLError | DeepLSuccess

export type DeepLSuccess = {
  translations: {
    detected_source_language: string
    text: string
  }[]
}

export const isDeepLError = (result: DeepLResult | Error | string): result is DeepLError => isDeepLResult(result) && 'message' in result && typeof result.message === 'string'

export const isDeepLResult = (result: DeepLResult | Error | string): result is DeepLResult => typeof result === 'object' && !(result instanceof Error) && ('message' in result || 'translatons' in result)

export const isDeepLSuccess = (result: DeepLResult | Error | string): result is DeepLSuccess => isDeepLResult(result) && 'translations' in result && typeof result.translations === 'object' && result.translations instanceof Array

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

export const isDeepLError = (result: DeepLResult): result is DeepLError => 'message' in result

export const isDeepLSuccess = (result: DeepLResult): result is DeepLSuccess => 'translations' in result

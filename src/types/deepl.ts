export type DeepLError = {
  message: string
}

export type DeepLResult = DeepLError | DeepLSuccess

export type DeepLSuccess = {
  translations: Translation[]
}

type Translation = {
  detected_source_language: string
  text: string
}

export const isDeepLError = (value: unknown): value is DeepLError | Error => isErrorLike(value)

export const isDeepLResult = (value: unknown): value is DeepLResult => isDeepLError(value) || isDeepLSuccess(value)

export const isDeepLSuccess = (value: unknown): value is DeepLSuccess => {
  const success = value as DeepLSuccess
  return typeof success === 'object' && success.translations instanceof Array && success.translations.every(isTranslationLike)
}

export const isErrorLike = (value: unknown): value is DeepLError | Error => {
  const error = value as Error
  return typeof error === 'object' && typeof error.message === 'string'
}

const isTranslationLike = (value: unknown): value is Translation => {
  const t = value as Translation
  return typeof t === 'object' && typeof t.detected_source_language === 'string' && typeof t.text === 'string'
}

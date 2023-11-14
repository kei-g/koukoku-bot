export type KoukokuProxyError = {
  error: {
    message: string
  }
}

export type KoukokuProxyPutResponse = {
  checksum: string
  byteLength: number
  etag: string
  expiresAt: string
  name: string
  result: object
  url: string
}

export type KoukokuProxyResponse = KoukokuProxyError | KoukokuProxyResult

export type KoukokuProxyResult = {
  result: boolean
}

export const describeKoukokuProxyResponse = (value: Error | KoukokuProxyResponse) => JSON.stringify(
  isKoukokuProxyError(value)
    ? { error: value.error.message }
    : (
      isKoukokuProxyResult(value)
        ? { accepted: value.result }
        : { error: value.message }
    )
)

export const isKoukokuProxyError = (value: unknown): value is KoukokuProxyError => {
  const response = value as KoukokuProxyError
  return typeof value === 'object' && typeof response.error === 'object' && typeof response.error.message === 'string'
}

export const isKoukokuProxyPutResponse = (value: unknown): value is KoukokuProxyPutResponse => {
  const response = value as KoukokuProxyPutResponse
  return typeof value === 'object' && typeof response.byteLength === 'number' && typeof response.checksum === 'string' && typeof response.etag === 'string' && typeof response.expiresAt === 'string'
}

export const isKoukokuProxyResult = (value: unknown): value is KoukokuProxyResult => {
  const response = value as KoukokuProxyResult
  return typeof value === 'object' && typeof response.result === 'boolean'
}

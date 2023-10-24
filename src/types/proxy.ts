export type ProxyError = {
  error: {
    message: string
  }
}

export type ProxyResponse = ProxyError | ProxyResult

export type ProxyResult = {
  result: boolean
}

export const describeProxyResponse = (value: Error | ProxyResponse) => JSON.stringify(
  isProxyError(value)
    ? { error: value.error.message }
    : (
      isProxyResult(value)
        ? { accepted: value.result }
        : { error: value.message }
    )
)

export const isProxyError = (value: unknown): value is ProxyError => {
  const response = value as ProxyError
  return typeof value === 'object' && typeof response.error === 'object' && typeof response.error.message === 'string'
}

export const isProxyResult = (value: unknown): value is ProxyResult => {
  const response = value as ProxyResult
  return typeof value === 'object' && typeof response.result === 'boolean'
}

export type ProxyError = {
  error: {
    message: string
  }
}

export type ProxyResponse = ProxyError | ProxyResult

export type ProxyResult = {
  result: boolean
}

export const isProxyError = (value: unknown): value is ProxyError => {
  const response = value as ProxyError
  return typeof value === 'object' && 'error' in response && 'message' in response.error && typeof response.error.message === 'string'
}

export const isProxyFailure = (value: unknown): value is Error | ProxyError | string => {
  const response = value as ProxyError
  return response instanceof Error || isProxyError(response) || typeof response === 'string'
}

export const isProxyResult = (value: unknown): value is ProxyResult => {
  const response = value as ProxyResult
  return typeof value === 'object' && 'result' in response && typeof response.result === 'boolean'
}

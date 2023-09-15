export type ProxyError = {
  error: {
    message: string
  }
}

export type ProxyResponse = ProxyError | ProxyResult

export type ProxyResult = {
  result: boolean
}

export const isProxyError = (response: ProxyResponse): response is ProxyError => 'error' in response && 'message' in response.error && typeof response.error.message === 'string'

export const isProxyResult = (response: ProxyResponse): response is ProxyResult => 'result' in response && typeof response.result === 'boolean'

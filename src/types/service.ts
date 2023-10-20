export interface Service extends AsyncDisposable {
  start(): Promise<void>
}

export const isService = (value: unknown): value is Service => {
  const service = value as Service
  return typeof value === 'object' && typeof service.start === 'function' && typeof service[Symbol.asyncDispose] === 'function'
}

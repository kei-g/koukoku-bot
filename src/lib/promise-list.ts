export class PromiseList extends Array<unknown> implements AsyncDisposable {
  constructor() {
    super()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await Promise.all(this.filter(isPromiseLike))
  }
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
  const thenable = value as PromiseLike<unknown>
  return typeof value === 'object' && typeof thenable.then === 'function'
}

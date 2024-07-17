export type Action<T = void, U = void> = (_value: T) => U

export type AsyncAction<T = void, U = void> = (_value: T) => PromiseLike<U>

export type FilterFunction<T = unknown> = Action<T, boolean>

export type TypeFunction<T> = (value: unknown) => value is T

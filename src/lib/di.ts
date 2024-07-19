import type {
  Action,
  AsyncAction,
  FilterFunction,
  TypeFunction,
} from '..'

import {
  PromiseList,
} from '..'

type ConstructorOf<A, B = undefined> = B extends unknown[]
  ? {
    new(..._args: B): A
  }
  : {
    new(): A
  }

class DependencyEntry extends Array<string> {
  readonly ctor: ConstructorOf<unknown, unknown[]>

  constructor(ctor: ConstructorOf<unknown, unknown[]>, depends: string[] | undefined) {
    const source = depends ?? []
    super(...source)
    this.ctor = ctor
  }
}

export class DependencyResolver {
  static resolve<A, B>(ctor: ConstructorOf<A, B>, ...args: unknown[]): A {
    const resolver = new DependencyResolver(...args)
    return resolver.#resolve(ctor)
  }

  readonly #arguments: unknown[]
  readonly #resolved = new Map<string, unknown>()

  #resolve<A, B>(ctor: ConstructorOf<A, B>): A {
    const byName = this.#resolved.get.bind(this.#resolved)
    const entries = new Set(dependencies)
    const isResolved = this.#resolved.has.bind(this.#resolved)
    const remove = entries.delete.bind(entries)
    this.#resolved.set(DependencyResolver.name, this)
    while (entries.size)
      for (const [name, depends] of resolvable(entries, isResolved, remove)) {
        const proxy = new Proxy(
          this,
          new FilterHandler(
            (value: unknown) => !(value === obj) // obj is intended to be rolled up
          )
        )
        this.#resolved.set(DependencyResolver.name, proxy)
        const { ctor } = dependencies.get(name)
        const obj = new ctor(...depends.map(byName))
        this.#resolved.set(name, obj)
      }
    this.#resolved.delete(DependencyResolver.name)
    return this.#resolved.get(ctor.name) as A
  }

  constructor(...args: unknown[]) {
    this.#arguments = args
  }

  argument<T>(index: number): T {
    return this.#arguments.at(index) as T
  }

  filter<T>(predicate: TypeFunction<T>): T[] {
    return [...this.#resolved.values()].filter(predicate)
  }

  getInstanceOf<A, B>(ctor: ConstructorOf<A, B>): A {
    for (const value of this.#resolved.values())
      if (value instanceof ctor)
        return value
  }

  async traverse<T>(cb: AsyncAction<T>, how: TraversalDirection, predicate: TypeFunction<T>): Promise<void> {
    await resolve(
      this.#resolved.get.bind(this.#resolved),
      cb,
      (value: unknown): value is T => !(value === undefined) && predicate(value),
      how === 'bottom-up-breadth-first' ? new Set(dependencies) : reverse(dependencies)
    )
  }
}

class FilterHandler {
  readonly #filter: FilterFunction

  #traverse<T>(traverse: TraversalFunctionType<T>): TraversalFunctionType<T> {
    return (cb: AsyncAction<T>, how: TraversalDirection, predicate: TypeFunction<T>) => traverse(
      async (value: T) => this.#filter(value) ? await cb(value) : undefined,
      how,
      predicate
    )
  }

  constructor(filter: FilterFunction) {
    this.#filter = filter
  }

  get(target: DependencyResolver, prop: string | symbol, receiver: unknown): unknown {
    const result = Reflect.get(target, prop, receiver)
    return prop === 'traverse' ? this.#traverse(result.bind(target)) : result.bind(target)
  }
}

type InferredConstructorOf<T, U extends unknown[]> = T extends [infer A, ...infer R]
  // XXX: NOTE - A better way to infer the type of constructors without 'any' is desired
  ? [{ new(..._args: U): A }, ...InferredConstructorOf<R, U>]
  : []

export function Injectable<A>(): PassThroughFunction<ConstructorOf<A>>
export function Injectable<A, B, C extends unknown[]>(_args: { DependsOn: Readonly<InferredConstructorOf<B, C>> }): PassThroughFunction<ConstructorOf<A, B>>
export function Injectable<A, B, C extends unknown[]>(args?: { DependsOn: Readonly<InferredConstructorOf<B, C>> }): PassThroughFunction<ConstructorOf<A, B>> {
  return (constructor: ConstructorOf<A, B>) => {
    const ctor = constructor as ConstructorOf<unknown, unknown[]>
    const obj = dependencies.get(ctor.name) ?? new DependencyEntry(ctor, args?.DependsOn?.map(c => c.name))
    dependencies.set(constructor.name, obj)
    return constructor
  }
}

type PassThroughFunction<T> = (_value: T) => T

type TraversalDirection = 'bottom-up-breadth-first' | 'top-down-depth-first'

type TraversalFunctionType<T> = (_cb: AsyncAction<T>, _how: TraversalDirection, _predicate: TypeFunction<T>) => Promise<void>

const dependencies = new Map<string, DependencyEntry>()

function* resolvable<A, B, C extends B[]>(entries: Iterable<[A, C]>, isResolved: FilterFunction<B>, remove: Action<[A, C]>): Generator<[A, C]> {
  const resolved = [] as [A, C][]
  for (const entry of entries)
    if (entry[1].every(isResolved)) {
      yield entry
      resolved.push(entry)
    }
  resolved.forEach(remove)
}

const resolve = async <T>(byName: Action<string, unknown>, cb: AsyncAction<T>, predicate: TypeFunction<T>, entries: Set<[string, string[]]>): Promise<void> => {
  const resolved = new Set<string>()
  resolved.add(DependencyResolver.name)
  const isResolved = resolved.has.bind(resolved)
  const remove = entries.delete.bind(entries)
  while (entries.size) {
    await using list = new PromiseList()
    for (const [name] of resolvable(entries, isResolved, remove)) {
      const value = byName(name)
      if (predicate(value))
        list.push(cb(value))
      resolved.add(name)
    }
  }
}

const reverse = (source: Iterable<[string, DependencyEntry]>): Set<[string, string[]]> => {
  const map = new Map([...source].map(withEmptyStringSet))
  for (const [caller, depends] of source)
    for (const callee of depends) {
      const callers = map.get(callee) ?? new Set()
      callers.add(caller)
      map.set(callee, callers)
    }
  return new Set([...map].map(spread))
}

const spread = <A, B>(item: [A, Iterable<B>]): [A, B[]] => [item[0], [...item[1]]]

const withEmptyStringSet = (item: [string, unknown]): [string, Set<string>] => [item[0], new Set()]

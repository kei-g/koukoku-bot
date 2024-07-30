import type {
  CommandService,
} from '..'

import {
  Injectable,
  KoukokuProxyService,
} from '..'

@Injectable({
  DependsOn: [
    KoukokuProxyService,
  ]
})
export class CalculationService implements CommandService {
  readonly #proxyService: KoukokuProxyService
  readonly #regexp = /^計算\s(?<expr>[πEIPaceginopstx\d\s.+\-*/%()]+)$/

  constructor(
    proxyService: KoukokuProxyService
  ) {
    this.#proxyService = proxyService
  }

  async execute(matched: RegExpMatchArray): Promise<void> {
    const expr = matched.groups.expr
    console.log(`[calc] \x1b[32m'${expr}'\x1b[m`)
    try {
      validateParentheses(expr)
      const keys = new Set(keyNamesOf(global))
      keys.add('globalThis')
      const args = [...keys]
      args.unshift('PI', 'E', 'cos', 'exp', 'log', 'sin', 'tan', 'π')
      args.push(`"use strict";return ${expr}`)
      const f = new Function(...args)
      const value = f(Math.PI, Math.E, Math.cos, Math.exp, Math.log, Math.sin, Math.tan, Math.PI)
      console.log(`[calc] \x1b[33m${value}\x1b[m`)
      await this.#proxyService.post(`[Bot] 計算結果は${value}です`)
    }
    catch (reason: unknown) {
      await this.#proxyService.post(`[Bot] 計算エラー, ${reason instanceof Error ? reason.message : reason}`)
    }
  }

  match(message: string): RegExpMatchArray {
    return message.match(this.#regexp)
  }

  async start(): Promise<void> {
  }

  async [Symbol.asyncDispose](): Promise<void> {
  }
}

interface Parenthesis {
  opened: number
  qualifier: string
}

const keyNamesOf = (obj: Record<string, unknown>) => {
  const keys = [] as string[]
  for (const key in obj)
    keys.push(key)
  return keys
}

const updateParenthesisContext = (ctx: Parenthesis, c: string) => {
  const addendum = valueForParenthesis[c]
  if (addendum === undefined)
    ctx.qualifier += c
  else {
    validateQualifier(ctx)
    ctx.opened += addendum
    ctx.qualifier = ''
  }
  return ctx
}

const validateParentheses = (expr: string): void => {
  const parenthesis = [...expr].reduce(updateParenthesisContext, { opened: 0, qualifier: '' })
  const messages = [
    `${parenthesis.opened}個の閉じ括弧が不足しています`,
    undefined,
    '不正な閉じ括弧があります',
  ]
  const index = (+isNaN(parenthesis.opened)) * 2 + +(parenthesis.opened === 0)
  const message = messages[index]
  if (typeof message === 'string')
    throw new Error(message)
}

const validateQualifier = (ctx: Parenthesis) => {
  console.log(ctx)
  if (ctx.qualifier.length && !['cos', 'exp', 'log', 'sin', 'tan'].includes(ctx.qualifier.trim()))
    throw new Error(`${ctx.qualifier}は関数ではありません`)
}

const valueForParenthesis = {
  ' ': 0,
  '%': 0,
  '(': 1,
  ')': -1,
  '*': 0,
  '+': 0,
  '-': 0,
  '.': 0,
  '/': 0,
  '0': 0,
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 0,
} as Record<string, number>

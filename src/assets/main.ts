import {
  isRedisStreamItemLog,
  recompose,
} from '../types'

import type {
  Log,
  LogOrSpeechWithTimestamp,
  RedisStreamItem,
  Speech,
} from '../types'

class Client {
  readonly #document: Document
  readonly #loading: Element[]
  readonly #messages: HTMLUListElement
  readonly #removeChild: <T extends Node>(_child: T) => T
  #webSocket: WebSocket

  #prepend(value: LogOrSpeechWithTimestamp): void {
    const { item, timestamp } = value
    const li = this.#document.getElementById(`${timestamp}`)
    isRedisStreamItemLog(item)
      ? this.#prependLog(item, li, timestamp)
      : this.#prependSpeech(item, li, timestamp)
  }

  #prependLog(item: RedisStreamItem<Log>, li: HTMLElement, timestamp: number): void {
    const text = recompose(item.message)
    if (li)
      li.textContent = text
    else {
      const li = createListItemNode(this.#document, text, timestamp)
      this.#messages.prepend(li)
      this.#loading.splice(0).forEach(this.#removeChild)
    }
  }

  #prependSpeech(item: RedisStreamItem<Speech>, li: HTMLElement, timestamp: number): void {
    if (li) {
      removeAllChildren(li)
      for (const text of item.message.body.split(/\r?\n/)) {
        li.append(document.createTextNode(text.replaceAll(' ', '\u{00a0}')))
        li.append(document.createElement('br'))
      }
    }
    else {
      const li = document.createElement('li')
      li.classList.add('speech')
      li.setAttribute('id', `${timestamp}`)
      for (const text of item.message.body.split(/\r?\n/)) {
        li.append(document.createTextNode(text.replaceAll(' ', '\u{00a0}')))
        li.append(document.createElement('br'))
      }
      this.#messages.prepend(li)
      this.#loading.splice(0).forEach(this.#removeChild)
    }
  }

  constructor(document: Document, messages: HTMLUListElement) {
    this.#document = document
    this.#loading = new NodeListArray(document.querySelectorAll('ul#messages>li.now-loading'))
    this.#messages = messages
    this.#removeChild = this.#messages.removeChild.bind(this.#messages)
  }

  connect(): void {
    this.#webSocket = new WebSocket('wss://' + this.#document.location.hostname)
    this.#webSocket.addEventListener('close', this.connect.bind(this))
    this.#webSocket.addEventListener('error', console.error)
    this.#webSocket.addEventListener('open', console.log)
    this.#webSocket.addEventListener(
      'message',
      async (msg: MessageEvent<WebSocketMessage>) => {
        const data = JSON.parse(await msg.data.text()) as LogOrSpeechWithTimestamp | LogOrSpeechWithTimestamp[]
        data instanceof Array
          ? data.slice(0, 100).reverse().map(this.#prepend.bind(this))
          : this.#prepend(data)
      }
    )
  }

  async say(event: Event): Promise<void> {
    const button = event.target as Element
    button.setAttribute('disabled', 'disabled')
    const form = button.parentElement
    const elements = [0, 1].map((i: number) => form.children.item(i) as HTMLInputElement)
    const [token, msg] = elements.map((e: HTMLInputElement) => e.value)
    const job = fetchJSON('/post', 'POST', { msg, token })
    elements[1].value = ''
    await job
    button.removeAttribute('disabled')
  }
}

type HasOffset = {
  offset: number
}

class NodeListArray<T extends Node> extends Array<T> {
  constructor(nodes: NodeListOf<T>) {
    super(nodes.length)
    for (let i = 0; i < nodes.length; i++)
      this[i] = nodes[i]
  }
}

interface WebSocketMessage {
  text(): Promise<string>
}

const createListItemNode = (document: Document, message: string, timestamp: number): HTMLLIElement => {
  const li = document.createElement('li')
  li.setAttribute('id', `${timestamp}`)
  const ctx = {} as HasOffset
  for (const matched of message.matchAll(urlRE))
    qualifyURL(document, ctx, li, matched)
  const offset = ctx.offset ?? 0
  if (offset < message.length)
    li.appendChild(document.createTextNode(message.slice(offset)))
  return li
}

async function fetchJSON<T>(_url: string, _method: 'GET'): Promise<T>
async function fetchJSON<T>(_url: string, _method: 'POST', _value: object): Promise<T>
async function fetchJSON<T>(url: string, method: 'GET' | 'POST', value?: object): Promise<T> {
  const init = {
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method,
    mode: 'cors',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
  } as RequestInit
  if (method !== 'GET')
    init.body = JSON.stringify(value)
  const response = await fetch(url, init)
  return await response.json()
}

const qualifyURL = (document: Document, last: HasOffset, li: HTMLLIElement, matched: RegExpMatchArray): void => {
  if (last.offset !== matched.index) {
    const value = matched.input.slice(last.offset ?? 0, matched.index)
    const text = document.createTextNode(value)
    li.appendChild(text)
  }
  const a = document.createElement('a')
  a.setAttribute('href', matched[0])
  a.setAttribute('target', '_blank')
  const text = document.createTextNode(matched[0])
  a.appendChild(text)
  li.appendChild(a)
  last.offset = matched.index + matched[0].length
}

const removeAllChildren = (element: HTMLElement): void => {
  while (element.childElementCount)
    element.firstChild.remove()
}

const urlRE = /https?:\/\/[\w!?/+\-_~=;.,*&@#$%()'[\]]+/g

window.addEventListener(
  'DOMContentLoaded',
  () => {
    const d = document
    const [msg, messages] = ['koukoku-shadan-open-ad-jp-message', 'messages'].map((id: string) => d.getElementById(id))
    const button = msg.nextElementSibling
    const client = new Client(d, messages as HTMLUListElement)
    button.addEventListener('click', client.say.bind(client))
    client.connect()
  }
)

import { Log } from '../types'

class Client {
  readonly #document: Document
  readonly #loading: Element[]
  readonly #messages: HTMLUListElement
  readonly #removeChild: <T extends Node>(child: T) => T

  #prepend(data: Log): void {
    const li = this.#document.getElementById(data.id)
    if (li)
      li.textContent = data.message.log
    else {
      const li = createListItemNode(this.#document, data.id, data.message.log)
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

  async connect(): Promise<void> {
    const data = await fetchJSON('/messages', 'GET') as Log[]
    data.forEach(this.#prepend.bind(this))
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

const createListItemNode = (document: Document, id: string, message: string): HTMLLIElement => {
  const li = document.createElement('li')
  li.setAttribute('id', id)
  const ctx = {} as HasOffset
  for (const matched of message.matchAll(urlRE))
    qualifyURL(document, ctx, li, matched)
  const offset = ctx.offset ?? 0
  if (offset < message.length)
    li.appendChild(document.createTextNode(message.slice(offset)))
  return li
}

async function fetchJSON<T>(url: string, method: 'GET'): Promise<T>
async function fetchJSON<T>(url: string, method: 'POST', value: object): Promise<T>
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
  const text = document.createTextNode(matched[0])
  a.appendChild(text)
  li.appendChild(a)
  last.offset = matched.index + matched[0].length
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

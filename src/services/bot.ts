import {
  AsyncAction,
  CommandService,
  DependencyResolver,
  Injectable,
  Log,
  LogService,
  PromiseList,
  Service,
  Speech,
  TelnetClientService,
  UserKeywordService,
  WebService,
  isCommandService,
  isService,
} from '..'
import { createHash } from 'crypto'

@Injectable({
  DependsOn: [
    LogService,
    DependencyResolver,
    TelnetClientService,
    UserKeywordService,
    WebService,
  ]
})
export class BotService implements Service {
  readonly #logService: LogService
  readonly #resolver: DependencyResolver
  readonly #userKeywordService: UserKeywordService
  readonly #webService: WebService

  #findHandler(log: Log, rawMessage: string): AsyncAction {
    const found = {} as { matched: RegExpMatchArray }
    const service = this.#resolver.filter(isCommandService).find(
      (service: CommandService) => !!(found.matched ??= service.match(log.body))
    )
    return service
      ? service.execute.bind(service, found.matched, rawMessage)
      : this.#userKeywordService.test.bind(this.#userKeywordService, log)
  }

  async #message(log: Log, rawMessage: string, timestamp: number): Promise<void> {
    const item = await this.#logService.prepend(log, timestamp)
    await using list = new PromiseList()
    list.push(this.#webService.broadcast(item, timestamp))
    if (log.self === undefined) {
      const handler = this.#findHandler(log, rawMessage)
      list.push(handler())
    }
  }

  async #speech(value: Omit<Speech, 'hash'>, rawMessage: string, timestamp: number | undefined): Promise<void> {
    const sha256 = createHash('sha256')
    sha256.update(rawMessage)
    const speech = value as Speech
    speech.hash = sha256.digest().toString('hex')
    const item = await this.#logService.prepend(speech, timestamp)
    this.#webService.broadcast(item, timestamp)
  }

  constructor(
    logService: LogService,
    resolver: DependencyResolver,
    telnetClientService: TelnetClientService,
    userKeywordService: UserKeywordService,
    webService: WebService
  ) {
    this.#logService = logService
    this.#resolver = resolver
    this.#userKeywordService = userKeywordService
    this.#webService = webService
    telnetClientService.on('message', this.#message.bind(this))
    telnetClientService.on('speech', this.#speech.bind(this))
  }

  async start(): Promise<void> {
    await this.#resolver.traverse(
      (service: Service) => service.start(),
      'bottom-up-breadth-first',
      isService
    )
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#resolver.traverse(
      (service: Service) => service[Symbol.asyncDispose](),
      'top-down-depth-first',
      isService
    )
  }
}

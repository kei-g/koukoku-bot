import { Bot, KoukokuServer } from '.'

const catchAndExit = (reason?: unknown) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exit(1)
}

const main = async () => {
  const server = {} as KoukokuServer
  server.port = parseInt(process.argv.at(3))
  if (isNaN(server.port))
    delete server.port
  server.name = process.argv.at(2)
  server.rejectUnauthorized = !process.argv.includes('--no-reject-unauthorized')
  process.stdout.write(`process is running on pid:\x1b[33m${process.pid}\x1b[m with ${JSON.stringify(server)}\n\n`)
  await using bot = new Bot(server)
  await bot.startAsync()
  await waitForSignalAsync('SIGINT')
}

const waitForSignalAsync = (signal: NodeJS.Signals): Promise<void> => new Promise((resolve: () => void) => process.on(signal, resolve))

main().catch(catchAndExit).then(() => process.exit(0))

import { Bot, KoukokuServer } from '.'
import { readFile } from 'fs/promises'

const catchAndExit = (reason?: unknown) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exit(1)
}

const demote = (): void => {
  const { SUDO_GID, SUDO_UID } = process.env
  if (SUDO_GID)
    process.setgid(parseInt(SUDO_GID))
  if (SUDO_UID)
    process.setuid(parseInt(SUDO_UID))
}

const getUserEntryAsync = async (name: string): Promise<string[]> => {
  const data = await readFile('/etc/passwd')
  return data.toString().split('\n').find((line: string) => line.split(':').at(0) === name)?.split(':')
}

const main = async () => {
  const { env } = process
  const { SUDO_USER } = env
  if (SUDO_USER) {
    const entry = await getUserEntryAsync(SUDO_USER)
    env.HOME = entry?.at(-2)
    env.SHELL = entry?.at(-1)
  }
  const server = {} as KoukokuServer
  server.port = parseInt(process.argv.at(3))
  if (isNaN(server.port))
    delete server.port
  server.name = process.argv.at(2)
  server.rejectUnauthorized = !process.argv.includes('--no-reject-unauthorized')
  process.stdout.write(`process is running on pid:\x1b[33m${process.pid}\x1b[m with ${JSON.stringify(server)}\n\n`)
  await using bot = new Bot(server)
  demote()
  await bot.startAsync()
  await waitForSignalAsync('SIGINT')
}

const waitForSignalAsync = (signal: NodeJS.Signals): Promise<void> => new Promise((resolve: () => void) => process.on(signal, resolve))

main().catch(catchAndExit).then(() => process.exit(0))

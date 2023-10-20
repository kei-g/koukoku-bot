import {
  Action,
  BotService,
  DependencyResolver,
} from '.'
import { readFile } from 'fs/promises'

const catchAndExit = (reason?: unknown) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exit(1)
}

const demote = (): void => {
  const { SUDO_GID, SUDO_UID } = process.env
  const gid = parseInt(SUDO_GID)
  if (!Number.isNaN(gid))
    process.setgid(gid)
  const uid = parseInt(SUDO_UID)
  if (!Number.isNaN(uid))
    process.setuid(uid)
}

const getUserEntryAsync = async (name: string): Promise<string[]> => {
  const data = await readFile('/etc/passwd')
  return data.toString().split('\n').find(
    (line: string) => line.split(':').at(0) === name
  )?.split(':')
}

const main = async () => {
  const { pid } = process
  console.log(`process is running on pid:\x1b[33m${pid}\x1b[m\n`)
  const { env } = process
  const { SUDO_USER } = env
  if (SUDO_USER) {
    console.log(`this process is executed by \x1b[32m${SUDO_USER}\x1b[m with 'sudo' command`)
    const entry = await getUserEntryAsync(SUDO_USER)
    env.HOME = entry?.at(-2)
    console.log(`\x1b[32m${env.HOME}\x1b[m is set for $HOME`)
    env.SHELL = entry?.at(-1)
    console.log(`\x1b[32m${env.SHELL}\x1b[m is set for $SHELL`)
  }
  const certificates = await Promise.all(
    ['fullchain', 'privkey'].map(renameTo).map(readFileAsync)
  )
  await using bot = DependencyResolver.resolve(BotService, ...certificates)
  demote()
  await bot.start()
  await waitForSignals('SIGINT', 'SIGTERM')
}

const readFileAsync = (path: string) => readFile(path).catch(
  (reason: NodeJS.ErrnoException) => reason
)

const renameTo = (name: string) => `certificates/${name}.pem`

const waitForSignals = (...signals: NodeJS.Signals[]): Promise<void> => new Promise(
  (resolve: Action) => signals.map(
    (signal: NodeJS.Signals) => process.on(signal, resolve)
  )
)

main().catch(catchAndExit).then(() => process.exit(0))

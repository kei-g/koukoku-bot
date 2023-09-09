import { Bot, KoukokuServer } from '.'

const main = async () => {
  try {
    const server = {} as KoukokuServer
    server.port = parseInt(process.argv.at(3))
    if (isNaN(server.port))
      delete server.port
    server.name = process.argv.at(2)
    server.rejectUnauthorized = !process.argv.includes('--no-reject-unauthorized')
    const bot = new Bot(server)
    await bot.startAsync()
  }
  catch (error: unknown) {
    console.error(error)
  }
}

main()

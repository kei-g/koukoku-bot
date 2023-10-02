import { SJIS } from '../src'

const main = async () => {
  const data = await SJIS.escape('🍏こんにちは世界🍎\n道\u{E0101}')
  console.log(data)
}

main()

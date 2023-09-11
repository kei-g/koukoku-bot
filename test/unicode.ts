import { Unicode } from '../src'

const main = () => {
  const data = Unicode.escape('🍏こんにちは世界🍎\n道\u{E0101}')
  console.log(data)
}

main()

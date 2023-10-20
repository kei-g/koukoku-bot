import { Action } from '../src/types/action'
import { SJIS } from '../src/lib/sjis'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { unlink } from 'fs/promises'

const main = async () => {
  const path = 'conf/sjis.json'
  const exists = existsSync(path)
  if (!exists) {
    const generator = spawn(
      'tools/generate-sjis-json.sh',
      [],
      {
        shell: true,
      }
    )
    await new Promise(
      (resolve: Action) => generator.on('exit', resolve)
    )
  }
  const data = await SJIS.escape('🍏こんにちは世界🍎\n道\u{E0101}')
  console.log(data)
  if (!exists)
    await unlink(path)
}

main()

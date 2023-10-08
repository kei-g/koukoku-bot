import { DeepL, PhiLLM } from '../src'

const main = async () => {
  const d = await PhiLLM.Dialogue.create()
  const response = await d.speakAsync('How many people live on the Earth?')
  if (typeof response === 'string') {
    console.log(response)
    if (process.env.DEEPL_AUTH_KEY) {
      const r = await DeepL.translateAsync(response, 'JA')
      console.log(r)
    }
  }
  else
    console.error(response.message)
  d[Symbol.dispose]()
}

main()

import { GitHub } from '../src'

const main = async () => {
  const response = await GitHub.uploadToGistAsync('test', 'こんにちは世界\nあいうえお\n')
  console.log(response)
  console.log(`deleting ${response.id}`)
  const statusCode = await GitHub.deleteGistAsync(response.id)
  console.log({ statusCode })
}

main()

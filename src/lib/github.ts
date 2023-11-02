import { IncomingMessage } from 'http'
import { GitHubResponse, bindToReadAsJSON, isGitHubRawResponse } from '..'
import { request as createRequest } from 'https'

export namespace GitHub {
  export const deleteGistAsync = (id: string): Promise<number> => new Promise(
    (resolve: (statusCode: number) => void) => {
      const request = createRequest(
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            'User-agent': `Node.js ${process.version}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          host: 'api.github.com',
          method: 'DELETE',
          path: `/gists/${id}`,
          protocol: 'https:',
        },
        (response: IncomingMessage) => resolve(response.statusCode)
      )
      request.end()
    }
  )

  export const uploadToGistAsync = async (name: string, content: string, description?: string): Promise<Error | GitHubResponse | string> => {
    const obj = {
      description: description ?? '',
      files: {} as Record<string, { content: string }>,
      public: false,
    }
    const fileName = `${name}.txt`
    obj.files[fileName] = { content }
    console.log(obj)
    const json = JSON.stringify(obj)
    const data = Buffer.from(json)
    const request = createRequest(
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Length': data.byteLength,
          'Content-Type': 'application/json',
          'User-agent': `Node.js ${process.version}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        host: 'api.github.com',
        method: 'POST',
        path: '/gists',
        protocol: 'https:',
      }
    )
    const readAsJSON = bindToReadAsJSON<GitHubResponse>(request)
    process.stdout.write(`send '\x1b[32m${json}\x1b[m' to ${request.host}${request.path}\n`)
    request.write(data)
    request.end()
    const response = await readAsJSON()
    console.log({ before: response })
    if (isGitHubRawResponse(response))
      response.rawUrl = response.files[fileName].raw_url
    console.log({ after: response })
    return response
  }
}

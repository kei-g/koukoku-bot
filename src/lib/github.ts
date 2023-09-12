import { IncomingMessage } from 'http'
import { GitHubResponse, isGitHubRawResponse, receiveAsJsonAsync } from '..'
import { request as createRequest } from 'https'

export namespace GitHub {
  export const deleteGistAsync = (id: string): Promise<number> => new Promise(
    (resolve: (statusCode: number) => void) => {
      const request = createRequest(
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
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

  export const uploadToGistAsync = async (name: string, text: string, description?: string): Promise<Error | GitHubResponse | string> => {
    const obj = {
      description: '',
      files: {
      } as Record<string, { content: string }>,
      public: false,
    }
    if (description)
      obj.description = description
    const fileName = name + '.txt'
    obj.files[fileName] = { content: text }
    console.log(obj)
    const json = JSON.stringify(obj)
    const content = Buffer.from(json)
    const request = createRequest(
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Length': content.byteLength,
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
    const response = await receiveAsJsonAsync<GitHubResponse>(request, content)
    console.log({ response })
    if (isGitHubRawResponse(response))
      response.rawUrl = response.files[fileName].raw_url
    console.log({ response })
    return response
  }
}

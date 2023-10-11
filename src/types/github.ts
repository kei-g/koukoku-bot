export type GitHubResponse = GitHubRawResponse & {
  rawUrl: string
}

export type GitHubRawResponse = {
  id: string
  files: Record<string, { raw_url: string }>
  url: string
}

export type GitHubSpeech = {
  content: string
  expiresAt: Date | string
  id: string
  url: string
}

export const isGitHubRawResponse = (response: unknown): response is GitHubRawResponse =>
  !(typeof response === 'string' || response instanceof Error)
  && typeof response === 'object'
  && ['id', 'files', 'url'].every((key: string) => key in response)

export const isGitHubResponse = (response: unknown): response is GitHubResponse =>
  isGitHubRawResponse(response) && 'rawUrl' in response && typeof response.rawUrl === 'string'

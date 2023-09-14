
const keywordRE = />>\s「\sキーワード(?<command>一覧|登録|解除)?(\s(?<name>(--help|[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}\w]{1,8})))?(\s(?<value>[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}\s\w]+))?\s」/u

const test = (text: string) => {
  const matched = text.match(keywordRE)
  if (matched) {
    const ctx = {} as Record<string, string>
    for (const key in matched.groups) {
      const value = matched.groups[key]
      if (typeof value === 'string')
        ctx[key] = value
    }
    console.log(ctx)
  }
  else
    console.log(`"${text}" is not matched`)
}

[
  '>> 「 キーワード--help 」',
  '>> 「 キーワード --help 」',
  '>> 「 キーワード一覧 」',
  '>> 「 キーワード登録 わんこ にゃんにゃんお 」',
  '>> 「 キーワード解除 わんこ 」',
  '>> 「 キーワード 」',
  '>> 「 キーワード 登録 わんこ 」'
].forEach(test)

process.stdin.on('data', (data: Buffer) => test(data.toString()))

# koukoku-bot [![license][license-image]][license-url]

[`koukoku-bot`][github-url] - Bot for telnets://koukoku.shadan.open.ad.jp

## CI Status

| Workflow Name | Status |
|:-:|:-:|
| **Build** | [![GitHub CI (Build)][github-build-image]][github-build-url] |
| **CodeQL** | [![GitHub CI (CodeQL)][github-codeql-image]][github-codeql-url] |

## TODO

- backlog
  - Accept speeches.
    - Pool short data and accumulate them.
- calculation
  - Interpret arithmetic expression.
    - `計算 4+3` has to be answered as `[Bot] 4+3=7`

## Usage

### Helps

```text
(コマンド)?リスト|ヘルプ

* 下記の説明文を表示する
```

```text
(バック)?ログ --help

* 過去ログに関する説明文を表示する

翻訳 --help

* 翻訳に関する説明文を表示する

キーワード --help
* キーワード機能に関する説明文を表示する
```

### Logs

```text
(バック)?ログ --help
* この説明文を表示する

(バック)?ログ 件数
* 指定した件数の過去ログを最大50件まで表示する
* 件数の指定がなければ50を省略したものとして扱う
```

### Translation

```text
翻訳 --help
* この説明文を表示する

翻訳 --lang
* 言語コードの一覧を表示する

翻訳 言語コード 文章
* 文章を指定した言語に翻訳する
* 言語コードを省略した場合は、英数記号以外を含む場合は英訳、それ以外は和訳する

※例えば下記のように、翻訳する文章としてURLエンコードされた文字列を指定可能です
翻訳 ja Vai tas ir c%C5%ABku s%C5%ABdi? N%C4%93, t%C4%81 ir mana seja.
```

### User defined keywords

```text
キーワード --help
* この説明文を表示する

キーワード登録 名前 テキスト
* 名前に指定したキーワードに反応してテキストを返すようにする
* 名前に使用できる文字はアルファベット・数字・ひらがな・カタカナ・漢字
* 名前の長さは最大8文字
* 登録済みのキーワードは解除してから登録しなおすとよい

キーワード解除 名前
* 登録した名前のキーワードを削除する

キーワード一覧
* 登録されたキーワードの一覧を表示する
* 登録数が少ない場合は演説を流す
* 多い場合はURLを発言する
```

## License

The scripts and documentation in this project are released under the [BSD-3-Clause License][license-url]

## Contributions

Contributions are welcome! See [Contributor's Guide](https://github.com/kei-g/koukoku-bot/blob/main/CONTRIBUTING.md)

### Code of Conduct

:clap: Be nice. See [our code of conduct](https://github.com/kei-g/koukoku-bot/blob/main/CODE_OF_CONDUCT.md)

[github-build-image]:https://github.com/kei-g/koukoku-bot/actions/workflows/build.yml/badge.svg
[github-build-url]:https://github.com/kei-g/koukoku-bot/actions/workflows/build.yml
[github-codeql-image]:https://github.com/kei-g/koukoku-bot/actions/workflows/codeql.yml/badge.svg
[github-codeql-url]:https://github.com/kei-g/koukoku-bot/actions/workflows/codeql.yml
[github-url]:https://github.com/kei-g/koukoku-bot
[license-image]:https://img.shields.io/github/license/kei-g/koukoku-bot
[license-url]:https://github.com/kei-g/koukoku-bot/blob/main/LICENSE

# koukoku-bot [![license][license-image]][license-url]

[`koukoku-bot`][github-url] - Bot for telnets://koukoku.shadan.open.ad.jp

## CI Status

| Workflow Name | Status |
|:-:|:-:|
| **Build** | [![GitHub CI (Build)][github-build-image]][github-build-url] |
| **CodeQL** | [![GitHub CI (CodeQL)][github-codeql-image]][github-codeql-url] |

## Usage

### Helps

- 行頭の `コマンドリスト` または `リスト` または `ヘルプ` に反応して、この Bot の機能に関する説明を演説します

<details>
<summary>演説内容</summary>

```text
コマンド
コマンドリスト
ヘルプ
* この説明を表示する

ログ --help
バックログ --help
* 過去ログに関するヘルプを表示する

翻訳 --help
* 翻訳に関するヘルプを表示する
```

</details>

### Logs

- 行頭の `ログ 件数` に反応して、指定した件数(**最大50件まで**)の過去ログを演説します
- `ログ --help` で過去ログ機能に関する説明文を演説させることができます

<details>
<summary>演説内容</summary>

```text
ログ --help
バックログ --help
* この説明を表示する

ログ 件数
バックログ 件数
* 指定した件数の過去ログを最大50件まで表示する

ログ
バックログ
* 過去ログを最大50件まで表示する

※1. 連続する同一ホストおよび同一メッセージは繰り返し記号で置換されます。
```

</details>

<details>
<summary>連続するログの置換例</summary>

置換前

```text
ぬるぽ ***.foo.example.com
ガッ ***.bar.example.com
ガッ ***.baz.example.com
ぬるぽ ***.baz.example.com
```

置換後

```text
ぬるぽ ***.foo.example.com
ガッ ***.bar.example.com
〃 ***.baz.example.com
ぬるぽ 〃
```

</details>

#### Example for logs

```text
ログ 10
```

### Translation

- 行頭の `翻訳 文章` に反応して指定された文章を翻訳することができます
- `翻訳 言語コード 文章` のように翻訳先の言語を指定することもできます
- `翻訳 --lang` で対応している言語コードの一覧を演説させることができます
- DeepL の仕様上、言語コードのみ対応しており、zh_CN や zh_TW のように国コードを付けても意味がありません
- `翻訳 --help` で翻訳機能に関する説明文を演説させることができます

<details>
<summary>演説内容</summary>

```text
翻訳 --help
* この説明文を表示する

翻訳 --lang
* 言語コードの一覧を表示する

翻訳 言語コード 文章
* 文章を指定した言語に翻訳する
* 言語コードを省略した場合は、英数記号以外を含む場合は英訳、それ以外は和訳する
```

</details>

## License

The scripts and documentation in this project are released under the [BSD-3-Clause License][license-url]

## TODO

- Calculation
  - Interpret arithmetic expression.
    - `計算 4+3` has to be answered as `[Bot] 4+3=7`
- Logging
  - Accept speeches.
    - Pool short data and accumulate them.
- User defined keywords
  - Register a new command.
    - ```キーワード登録 わんこ わんわんお``` to make this bot respond ```[Bot] わんわんお``` for the keyword ```わんこ```
  - Unregister the command.
    - ```キーワード解除 わんこ``` to make this bot forget the keyword ```わんこ```
  - List the user defined commands.
    - ```キーワード一覧``` to make this bot generate a speech, ```わんこ わんわんお\nにゃんこ みゃーお```.

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

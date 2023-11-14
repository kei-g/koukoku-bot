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

キーワード --help
* キーワード機能に関するヘルプを表示する

計算 式
* 加減乗除,剰余,冪乗,三角関数,指数関数,対数関数の式の計算結果を返す
* 乗算記号は * (アスタリスク)
* 除算記号は / (スラッシュ)
* 剰余記号は % (パーセント)
* 冪乗記号は ** (2つの連続するアスタリスク)
* 利用可能な関数は cos,exp,log,sin,tan
* 利用可能な定数は PI,E,π

集計 --help
* 発言回数の集計機能に関するヘルプを表示する

対話 本文
* Phi-1.5 LLMに最大50トークンまでの文を生成させる
* 生成に30秒から1分程度の時間を要する
* 翻訳機能を併用することで日本語に対応している
```

</details>

### Logs

- 行頭の `ログ 件数` に反応して、指定した件数(**最大30件まで**)の過去ログを演説します
  - 連続する同一ホスト及び同一メッセージは繰り返し記号で置換されます
  - `since` および `until` を用いて範囲を指定することができます
- `ログ --help` で過去ログ機能に関する説明文を演説させることができます

<details>
<summary>演説内容</summary>

```text
ログ --help
バックログ --help
* この説明を表示する

ログ 件数 since 日時 until 日時
バックログ 件数 since 日時 until 日時
* 指定した件数の過去ログを最大 30 件まで表示する
* 件数を省略した場合, 10 件とみなす
* since および until の後ろの日時は以下の形式で指定
 1. YYYY/MM/dd HH:mm:ss 形式の文字列
  1.1. 日付
   - 日付のセパレータとして / または - を利用可能
   - 年を省略すると今年の日付として解釈する
  1.2. 時刻
   - 時刻のセパレータとして : を利用可能
   - 時刻を省略すると 00:00:00 として解釈する
   - 秒を省略すると 00 秒として解釈する
 2. 1970/01/01 00:00:00 からの経過時間 (ミリ秒単位)
* since を省略した場合, until から遡って表示する
* until を省略した場合, since から表示する
* 両方省略した場合, 現在時刻から遡って表示する

※1. 連続する同一ホストおよび同一メッセージは繰り返し記号で置換されます。
※2. [時報]および[Bot]で始まるメッセージは除外されます。
※3. およそ 1 兆 6943 億ミリ秒頃からのログを保持しています。
※4. すべての発言を記録できておらず、欠損している箇所があります。
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

<details>
<summary>ログコマンドの例</summary>

```text
ログ 5
```

</details>

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

※例えば下記のように、翻訳する文章としてURLエンコードされた文字列を指定可能です
翻訳 ja Vai tas ir c%C5%ABku s%C5%ABdi? N%C4%93, t%C4%81 ir mana seja.

※翻訳時にBotは%の前後の空白を取り除くので、意図的に空白を挿入したい箇所は%20にしてください
翻訳 ja Le chat%20%C3%A9met un miaulement

翻訳 --help
* この説明を表示する

翻訳 --lang
* 言語コードの一覧を表示する

翻訳 言語コード 文章
* 文章を指定した言語に翻訳する

翻訳 文章
* 英数記号以外を含む場合は英訳,それ以外は和訳する
```

</details>

### User defined keywords

- 行頭の `キーワード登録 名前 テキスト` に反応して、指定した名前に指定したテキストを反応させることができます
  - 名前に使用できる文字はアルファベット・数字・ひらがな・カタカナ・漢字です
  - 名前の長さは最大8文字です
- `キーワード一覧` で登録済みのキーワードの一覧を見ることができます
- 登録されたキーワードを解除したい場合は `キーワード解除 名前` とします
- `キーワード --help` でキーワード機能に関する説明文を演説させることができます

<details>
<summary>演説内容</summary>

```text
キーワード --help
* この説明を表示する

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

</details>

### Calculation

- 行頭の `計算 式` に反応して、指定された式を計算させることができます
  - 加減乗除,剰余,冪乗に対応しています
    - 加算記号は + (プラス)
    - 減算記号は - (マイナス)
    - 乗算記号は * (アスタリスク)
    - 除算記号は / (スラッシュ)
    - 剰余記号は % (パーセント)
    - 冪乗記号は ** (2つの連続するアスタリスク)
  - 関数に対応しています
    - 三角関数 (cos,sin,tan)
    - 指数関数 (exp)
    - 対数関数 (log)
  - 定数を利用できます
    - 自然対数の底 (E)
    - 円周率 (PI)または(π)

#### Example for calculation

<details>
<summary>計算の例</summary>

```text
計算 4+3*(-2)-1
```

```text
計算 cos(π)+log(E)
```

</details>

### Tallying

- 行頭の `集計` に反応して、区別可能なホストごとの週次発言回数を集計させることができます
- `集計 --help` で集計機能に関する説明文を演説させることができます

<details>
<summary>演説内容</summary>

```text
集計 --help
* この説明を表示する

集計
* 週次の逆引きホスト名で区別可能なクライアントの数とその発言回数を集計する
```

</details>

### Conversations

- 行頭の `対話` に反応して、Phi-1.5 LLM と会話をすることができます

#### Example for conversations

<details>
<summary>対話コマンドの例</summary>

```text
対話 空はなぜ青いのですか？
```

</details>

## License

The scripts and documentation in this project are released under the [BSD-3-Clause License][license-url]

## TODO

- Logging
  - Separate the logging function from the main part of the bot into another process to avoid incomplete loggings during the service restarts.

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

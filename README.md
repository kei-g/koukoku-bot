# koukoku-bot [![license][license-image]][license-url]

[`koukoku-bot`][github-url] - Bot for telnets://koukoku.shadan.open.ad.jp

## CI Status

| Workflow Name | Status |
|:-:|:-:|
| **Build** | [![GitHub CI (Build)][github-build-image]][github-build-url] |
| **CodeQL** | [![GitHub CI (CodeQL)][github-codeql-image]][github-codeql-url] |

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
- Web interface
  - Support websocket.

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

export const abbreviateHostName = (hostname: string) => hostname.replaceAll(abbreviationRE, '')

const abbreviationRE = /(\*+[-.]?)+/g

const dateRE = /^(?<era>\p{scx=Han}+)(?<year>\d+)年(?<month>\d+)月(?<day>\d+)日\((?<weekday>\p{scx=Han}+)\)$/u

export const formatDateTimeToFullyQualifiedString = (target: Date): string => {
  if (!isNaN(target?.getTime() ?? NaN)) {
    const locale = 'ja-JP-u-ca-japanese'
    const date = target.toLocaleDateString(
      locale,
      {
        day: 'numeric',
        era: 'long',
        month: 'long',
        weekday: 'short',
        year: 'numeric',
      }
    )
    const matched = date.match(dateRE)
    const { era, year, month, day, weekday } = matched.groups
    const [hour, minute, second] = target.toLocaleTimeString(
      locale,
      {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }
    ).split(':')
    return `${era} ${year} 年 ${month} 月 ${day} 日 (${weekday}) ${hour} 時 ${minute} 分 ${second} 秒`
  }
}

export const parseIntOr = <T>(text: string, defaultValue: T, radix?: number): T | number => {
  const c = parseInt(text, radix)
  return isNaN(c) ? defaultValue : c
}

export const passThrough = <T>(value: T) => value

export const sequentialNumbers = (length: number, offset: number = 0) => [...new Array(length)].map(
  (_: number, i: number) => i + offset
)

export const suppress = <T extends Error>(error: T): void => (
  console.error(error.message),
  undefined
)

export const twoDigitString = (value: number | string) => ('0' + value).slice(-2)

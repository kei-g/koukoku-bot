export type PeriodicPeriod = 'hourly' | 'minutely'

export type PeriodicSchedule = {
  behind: bigint
  delta: bigint
  minute: number
  time: bigint
}

export type PeriodicPeriod = 'hourly' | 'minutely'

export type PeriodicSchedule = {
  behind: bigint
  delta: bigint
  minute: number
  isHourly: boolean
  time: bigint
}

export type PeriodicPeriod = {
  hours?: number[]
  minutes?: number[]
}

export type PeriodicSchedule = {
  behind: bigint
  delta: bigint
  hour: number
  minute: number
  time: bigint
}

export interface PeriodicPeriod {
  hours?: number[]
  minutes?: number[]
}

export interface PeriodicSchedule {
  behind: bigint
  delta: bigint
  hour: number
  minute: number
  time: bigint
}

export namespace Periodic {
  export const hoursOr = <T>(period: PeriodicPeriod | undefined, alternateValue: T): T | number[] => period?.hours ?? alternateValue

  export const minutesOr = <T>(period: PeriodicPeriod | undefined, alternateValue: T): T | number[] => period?.minutes ?? alternateValue
}

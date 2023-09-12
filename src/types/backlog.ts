export type BackLog = {
  id: string
  message: {
    log: string
  }
}

export const selectBodyOfBackLog = (data: BackLog) => data.message.log

export type Log = {
  id: string
  message: {
    log: string
  }
}

export const selectBodyOfLog = (data: Log) => data.message.log

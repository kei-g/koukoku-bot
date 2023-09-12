export type Log = {
  id: string
  message: {
    log: string
  }
}

export const selectBodyOfBackLog = (data: Log) => data.message.log

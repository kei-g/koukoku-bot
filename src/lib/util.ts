export const suppress = <T extends Error>(error: T): void => (
  console.error(error.message),
  undefined
)

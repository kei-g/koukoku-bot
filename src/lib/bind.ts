export const bind1st = <A1, O extends unknown[], R>(arg: A1, func: (arg: A1, ...args: O) => R) => (...args: O) => func(arg, ...args)

export const bind2nd = <A1, A2, O extends unknown[], R>(arg2: A2, func: (arg1: A1, arg2: A2, ...args: O) => R) => (arg1: A1, ...args: O) => func(arg1, arg2, ...args)

export const bind3rd = <A1, A2, A3, O extends unknown[], R>(arg3: A3, func: (arg1: A1, arg2: A2, arg3: A3, ...args: O) => R) => (arg1: A1, arg2: A2, ...args: O) => func(arg1, arg2, arg3, ...args)

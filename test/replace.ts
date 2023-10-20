import { applyEnvironmentVariables } from '../src/lib/env'
import { readFileSync } from 'fs'

const data = readFileSync('assets/main.html')
const result = applyEnvironmentVariables(data.toString())
console.log(result)

process.env.FOO = 'SHELL'
console.log(applyEnvironmentVariables('$${FOO} is ${${FOO}}, $TERM is ${TERM}'))

console.log(applyEnvironmentVariables('$XDG_RUNTIME_DIR is ${XDG_RUNTIME_DIR}'))

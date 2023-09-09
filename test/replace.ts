import { readFileSync } from 'fs'
import { replaceVariables } from '../src'

const data = readFileSync('assets/main.html')
const result = replaceVariables(data)
console.log(result.toString())

#!/usr/bin/env node

const aggregate = names => {
  updates.sort(ascendingByTime)
  for (const u of updates.splice(0)) {
    if (names.includes(u.name) && updates.some(pairwisedFor(names[1 - names.indexOf(u.name)], u.version)))
      updates.pop()
    updates.push(u)
  }
}

const ascendingByTime = (lhs, rhs) => lhs.time - rhs.time

const main = async () => {
  const names = []
  aggregate(names)
  const opts = {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    year: 'numeric',
  }
  for (const u of updates.splice(0)) {
    const { dependencies, devDependencies, packageManager } = await readPackageJSON()
    const mergedDependencies = merge(dependencies, devDependencies)
    if (packageManager)
      mergedDependencies.pnpm = packageManager.replace(/^[^@]+@(\d+(?:\.\d+){2})\+[^.]+\.[\da-f]+$/, '^$1')
    const previousVersion = mergedDependencies[u.name].slice(1)
    const date = new Date(u.time)
    const time = date.toLocaleString('ja', opts).replaceAll('/', '-')
    const offset = date.getTimezoneOffset() * -5 / 3
    const sign = ['+', '-'][+(Math.sign(offset) < 0)]
    const at = `${time} ${sign}${('000' + Math.abs(offset)).slice(-4)}`
    const index = +names.includes(u.name)
    const labels = [
      u.name,
      names.join('` and `'),
    ]
    const versions = [
      [u.value],
      names.map(name => `${name}@${u.version}`),
    ]
    if (u.name === 'pnpm')
      await run('corepack', 'use', `${u.name}@${u.version}`)
    else {
      const flag = ['--save', '-D'][+(u.name in devDependencies)]
      await run('npm', 'i', ...versions[index], flag)
    }
    await run('git', 'add', '.')
    await run('git', 'commit', '--date', at, '-m', `:arrow_up: Bump \`${labels[index]}\` from ${previousVersion} to ${u.version}`)
    await run('faketime', at, 'git', 'commit', '--amend', '--date=now', '--no-edit', '-S', '-s')
  }
}

const merge = (...args) => {
  const obj = {}
  for (const arg of args)
    for (const key in arg)
      obj[key] = arg[key]
  return obj
}

const notify = (isNewer, list, name) => {
  const data = JSON.parse(Buffer.concat(list).toString())
  for (const [version, value] of Object.entries(data))
    if (isNewer(version)) {
      const t = new Date(value).getTime()
      const time = 1e3 * Math.floor((t + 999) / 1e3)
      updates.push({ name, time, value: `${name}@${version}`, version })
    }
  hist.delete(name)
  if (hist.size === 0)
    ev.emit('ready')
}

const pairwisedFor = (name, version) => t => t.name === name && t.version === version

const run = async (command, ...args) => {
  const cp = spawn(command, args, { env, stdio: 'inherit' })
  await new Promise(cp.on.bind(cp, 'exit'))
}

const versionToInt = (...v) => (v[0] << 12) | (v[1] << 6) | v[2]

const { readFile } = await import('node:fs/promises')
const readPackageJSON = () => readFile('package.json').then(
  data => JSON.parse(data.toString())
)

const { dependencies, devDependencies, packageManager } = await readPackageJSON()
if (packageManager)
  devDependencies.pnpm = packageManager.replace(/^[^@]+@(\d+(?:\.\d+){2})\+[^.]+\.[\da-f]+$/, '^$1')
const { EventEmitter } = await import('node:events')
const { spawn } = await import('child_process')
const { env } = process
delete env.NODE_OPTIONS
const ev = new EventEmitter()
ev.on('ready', main)
const hist = new Set()
const updates = []
const versionRE = /^\d+(\.\d+){2}$/
const blacklist = {
}
const mergedDependencies = merge(dependencies, devDependencies)
for (const name in mergedDependencies) {
  hist.add(name)
  const current = mergedDependencies[name].slice(1).split('.').map(Number)
  const upperBound = blacklist[name] ?? Number.MAX_SAFE_INTEGER
  const isNewer = version => {
    if (versionRE.test(version)) {
      const v = version.split('.').map(Number)
      const value = versionToInt(...v)
      const score = +(value < upperBound) * 2 + +(versionToInt(...current) < value)
      const newer = score === 3
      if (newer)
        v.forEach((x, i) => current[i] = x)
      return newer
    }
  }
  const npm = spawn('npm', ['view', name, 'time', '--json'], { env })
  const list = []
  npm.stdout.on('data', list.push.bind(list))
  npm.stderr.pipe(process.stderr)
  npm.on('exit', notify.bind(this, isNewer, list, name))
}

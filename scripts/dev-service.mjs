import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1])
}

const app = args.get('--app')
const envFile = args.get('--env-file')

if (!app || !envFile) {
    console.error('Usage: node scripts/dev-service.mjs --app <name> --env-file <path>')
    process.exit(1)
}

const workspaceRoot = process.cwd()
const appRoot = join(workspaceRoot, 'apps', app)
const distMain = join(workspaceRoot, 'dist', 'apps', app, 'main.js')
const absoluteEnvFile = resolve(workspaceRoot, envFile)

let serviceProcess = null
let restartQueued = false
let stopping = false

const webpackProcess = spawn('pnpm', ['exec', 'webpack-cli', 'build', '--watch', '--node-env=development'], {
    cwd: appRoot,
    env: {
        ...process.env,
        NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
})

function pipeOutput(stream) {
    stream.on('data', (chunk) => {
        const output = chunk.toString()
        process.stdout.write(output)

        // eslint-disable-next-line no-control-regex
        const plainOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        if (/webpack compiled[\s\S]*successfully/.test(plainOutput)) {
            queueRestart()
        }
    })
}

function queueRestart() {
    if (restartQueued) {
        return
    }

    restartQueued = true
    setTimeout(() => {
        restartQueued = false
        restartService()
    }, 100)
}

function restartService() {
    if (!existsSync(distMain)) {
        return
    }

    if (serviceProcess && !serviceProcess.killed) {
        serviceProcess.once('exit', startService)
        serviceProcess.kill('SIGTERM')
        return
    }

    startService()
}

function startService() {
    if (stopping) {
        return
    }

    serviceProcess = spawn(process.execPath, [`--env-file=${absoluteEnvFile}`, distMain], {
        cwd: workspaceRoot,
        stdio: 'inherit'
    })

    serviceProcess.on('exit', (code, signal) => {
        if (!stopping && code && signal !== 'SIGTERM') {
            console.error(`[${app}] service exited with code ${code}`)
        }
    })
}

async function stopAll(signal) {
    stopping = true

    if (webpackProcess && !webpackProcess.killed) {
        webpackProcess.kill(signal)
    }

    if (serviceProcess && !serviceProcess.killed) {
        serviceProcess.kill(signal)
    }
}

pipeOutput(webpackProcess.stdout)
pipeOutput(webpackProcess.stderr)

webpackProcess.on('exit', (code, signal) => {
    if (!stopping && code) {
        console.error(`[${app}] webpack watcher exited with code ${code}`)
        process.exit(code)
    }

    if (!stopping && signal) {
        process.exit(1)
    }
})

process.on('SIGINT', async () => {
    await stopAll('SIGINT')
    process.exit(130)
})

process.on('SIGTERM', async () => {
    await stopAll('SIGTERM')
    process.exit(143)
})

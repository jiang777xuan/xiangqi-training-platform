import { createServer } from 'node:http'
import { createApp } from './app.ts'
import { readPikafishConfig } from './engine/config.ts'
import { PikafishEngine } from './engine/pikafish.ts'
import { localPorts } from './localConfig.ts'
import { EngineService } from './services/engineService.ts'

const ports = localPorts(process.env)
const configured = Boolean(process.env.PIKAFISH_PATH?.trim())
let engine: PikafishEngine | undefined
if (configured) {
  try { engine = new PikafishEngine(readPikafishConfig()) }
  catch { console.error('Pikafish 配置无效。HTTP 服务仍可运行。') }
}
const service = new EngineService(engine, configured)
const server = createServer({
  headersTimeout: 10_000, requestTimeout: 15_000, keepAliveTimeout: 5_000, connectionsCheckingInterval: 1000,
}, createApp(service, ports))

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`无法启动本地分析服务（${error.code ?? '未知错误'}）。`)
  process.exitCode = 1
})
server.listen(ports.apiPort, '127.0.0.1', () => {
  console.log(`Xiangqi Master 本地分析服务 http://127.0.0.1:${ports.apiPort}`)
})

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  server.close()
  try { await service.close() }
  catch {
    console.error('无法确认 Pikafish 已正常关闭。')
    process.exitCode = 1
  } finally { server.closeAllConnections() }
}
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })

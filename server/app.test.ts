import { once } from 'node:events'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createStandardGame } from '../shared/xiangqi/index.ts'
import type { AnalysisRequest, AnalysisResult } from '../shared/analysis/types.ts'
import { createApp } from './app.ts'
import { preparePosition } from './engine/position.ts'
import { PikafishError } from './engine/types.ts'
import { EngineService } from './services/engineService.ts'

const initialFen = createStandardGame().toFen()
const standard = { initialFen, requestId: 'opening', limit: { kind: 'depth', depth: 12 }, multiPv: 3 } as const
const bestMove = { from: 'b2', to: 'e2', piece: 'cannon', side: 'red', notation: '炮八平五', capture: false, round: 1 } as const
let running: { server: Server; service: EngineService } | undefined

async function fakeAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
  const { game, fen } = preparePosition(request)
  const score = { kind: 'cp', value: 34, bound: 'exact' } as const
  return {
    kind: 'analysis', fen, sideToMove: game.getTurn(), status: game.getStatus(), requestedMultiPv: request.multiPv ?? 1, expectedMultiPv: 1,
    depth: 12, elapsedMs: 7, bestMove, ponder: null, warnings: [],
    variations: [{ depth: 12, multipv: 1, score: { raw: score, red: score, sideToMove: game.getTurn() }, nodes: 3200, pv: [bestMove] }],
  }
}

function fakeEngine(analyze: (request: AnalysisRequest, options: { signal: AbortSignal }) => Promise<AnalysisResult> = fakeAnalysis) {
  return { version: '2026-09-06', analyze: vi.fn(analyze), close: vi.fn(async () => {}) }
}

async function listen(service: EngineService) {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP address')
  server.on('request', createApp(service, { apiPort: address.port }))
  running = { server, service }
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  if (!running) return
  const { server, service } = running
  running = undefined
  const closed = once(server, 'close')
  server.close()
  await service.close()
  server.closeAllConnections()
  await closed
})

function post(url: string, endpoint: string, body: object, options?: RequestInit) {
  return fetch(`${url}/api/engine/${endpoint}`, {
    body: JSON.stringify(body), method: 'POST', headers: { 'Content-Type': 'application/json' }, ...options,
  })
}

function blockingEngine() {
  const observed: AbortSignal[] = []
  const engine = fakeEngine((request, { signal }) => {
    // /status probes use one ply; block only actual analysis requests.
    if (request.limit?.kind === 'depth' && request.limit.depth === 1) return fakeAnalysis(request)
    observed.push(signal)
    return new Promise((_resolve, reject) => {
      function abort() { reject(new PikafishError('cancelled', 'fake cancel')) }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  })
  return { engine, observed }
}

it('真实 HTTP 监听可用，健康状态与引擎配置状态独立', async () => {
  const url = await listen(new EngineService(undefined, false))
  const health = await fetch(url + '/api/health')
  expect(health.status).toBe(200)
  expect(await health.json()).toEqual({ ok: true })
  expect(health.headers.get('x-powered-by')).toBeNull()
  const status = await fetch(url + '/api/engine/status')
  expect(await status.json()).toEqual({
    configured: false, available: false, version: null, analyzing: false,
    error: { code: 'not-configured', message: expect.any(String) },
  })
  const response = await post(url, 'analyze', standard)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ error: { code: 'not-configured' } })
})

it('探测一次引擎版本和可用性，随后返回结构化、可追溯的分析结果', async () => {
  const engine = fakeEngine()
  const url = await listen(new EngineService(engine, true))
  const status = await fetch(url + '/api/engine/status')
  expect(await status.json()).toEqual({ configured: true, available: true, version: '2026-09-06', analyzing: false, error: null })
  await fetch(url + '/api/engine/status')
  expect(engine.analyze).toHaveBeenCalledTimes(1)
  const response = await post(url, 'analyze', standard)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    requestId: 'opening', fen: initialFen, sideToMove: 'red', depth: 12, elapsedMs: 7, kind: 'analysis',
    bestMove: { notation: '炮八平五' }, variations: [{ nodes: 3200, score: { raw: { value: 34 }, red: { value: 34 } } }],
  })
})

it('缺失安装或引擎故障时，状态和错误响应不透露本机路径', async () => {
  const engine = fakeEngine(async () => { throw new PikafishError('launch', 'no executable E:\\private\\pikafish.exe') })
  const url = await listen(new EngineService(engine, true))
  const status = await fetch(url + '/api/engine/status')
  const content = await status.text()
  expect(JSON.parse(content)).toMatchObject({ configured: true, available: false, analyzing: false, error: { code: 'engine-unavailable' } })
  expect(content).not.toContain('private')
  const response = await post(url, 'analyze', standard)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private')
})

it.each([
  ['未知的引擎路径字段', { ...standard, executable: 'test.exe' }],
  ['非对象请求体', []],
  ['非法搜索参数', { ...standard, limit: { kind: 'time', ms: 31_000 } }],
  ['非法 MultiPV', { ...standard, multiPv: 11 }],
  ['禁止换行的 FEN', { ...standard, initialFen: `${initialFen}\nquit` }],
  ['格式错误的坐标', { ...standard, moves: [{ from: 'b2', to: 'e2\n' }] }],
])('%s 在交给引擎前拒绝', async (_label, data) => {
  const engine = fakeEngine()
  const url = await listen(new EngineService(engine, true))
  const response = await post(url, 'analyze', data)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: { code: 'invalid-request' } })
  expect(engine.analyze).not.toHaveBeenCalled()
})

it.each([
  ['非法 FEN', { ...standard, initialFen: 'invalid FEN' }, /起始 FEN/],
  ['非法历史', { ...standard, moves: [{ from: 'b2', to: 'c3' }] }, /第 1 着非法/],
] as const)('%s 调用现有棋局校验并返回 400', async (_label, data, message) => {
  const url = await listen(new EngineService(fakeEngine(), true))
  const response = await post(url, 'analyze', data)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: { code: 'invalid-request', message: expect.stringMatching(message) } })
})

it('分析和取消只读取合规 JSON，限制请求体为 64 KiB', async () => {
  const engine = fakeEngine()
  const url = await listen(new EngineService(engine, true))
  const text = await post(url, 'cancel', { requestId: 'opening' }, { headers: { 'Content-Type': 'text/plain' } })
  expect(text.status).toBe(415)
  const invalid = await post(url, 'analyze', standard, { body: '{' })
  expect(invalid.status).toBe(400)
  const oversized = await post(url, 'analyze', { initialFen: 'a'.repeat(70_000), requestId: 'oversized' })
  expect(oversized.status).toBe(413)
  expect(engine.analyze).not.toHaveBeenCalled()
})

it('拒绝意外 Origin 和 Host，Vite 本地来源可通过且没有 CORS 通配符', async () => {
  const engine = fakeEngine()
  const url = await listen(new EngineService(engine, true))
  const headers = { 'Content-Type': 'application/json', Origin: 'https://unexpected.invalid' }
  expect((await post(url, 'analyze', standard, { headers })).status).toBe(403)
  expect((await post(url, 'cancel', { requestId: 'opening' }, { headers })).status).toBe(403)
  const response = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(url + '/api/engine/analyze', {
      method: 'POST', headers: { Host: 'unexpected.invalid:5173', 'Content-Type': 'application/json' },
    }, (res) => { res.resume(); resolve(res.statusCode) })
    request.on('error', reject)
    request.end(JSON.stringify(standard))
  })
  expect(response).toBe(403)
  expect(engine.analyze).not.toHaveBeenCalled()
  const local = await post(url, 'analyze', standard, {
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', 'Sec-Fetch-Site': 'same-origin' },
  })
  expect(local.status).toBe(200)
  expect(local.headers.get('access-control-allow-origin')).toBeNull()
})

it('忙碌返回 409 并通过精确的请求编号取消，旧编号不能停止新任务', async () => {
  const { engine, observed } = blockingEngine()
  const url = await listen(new EngineService(engine, true))
  const first = post(url, 'analyze', standard)
  await vi.waitFor(() => expect(observed).toHaveLength(1), { interval: 5 })
  const status = await fetch(url + '/api/engine/status')
  expect(await status.json()).toMatchObject({ analyzing: true })
  const busy = await post(url, 'analyze', { ...standard, requestId: 'next' })
  expect(busy.status).toBe(409)
  expect(await busy.json()).toMatchObject({ error: { code: 'busy' } })
  const cancelled = await post(url, 'cancel', { requestId: 'opening' })
  expect(await cancelled.json()).toEqual({ requestId: 'opening', cancelled: true })
  expect((await first).status).toBe(409)
  expect((await post(url, 'analyze', standard)).status).toBe(409)

  const next = post(url, 'analyze', { ...standard, requestId: 'next' })
  await vi.waitFor(() => expect(observed).toHaveLength(2), { interval: 5 })
  expect((await post(url, 'cancel', { requestId: 'opening' })).status).toBe(404)
  expect(observed[1].aborted).toBe(false)
  await post(url, 'cancel', { requestId: 'next' })
  await next
})

it('客户中断连接后取消对应任务并释放任务位', async () => {
  const { engine, observed } = blockingEngine()
  const url = await listen(new EngineService(engine, true))
  const controller = new AbortController()
  const first = post(url, 'analyze', standard, { signal: controller.signal }).catch(() => null)
  await vi.waitFor(() => expect(observed).toHaveLength(1), { interval: 5 })
  controller.abort()
  await expect(first).resolves.toBeNull()
  await vi.waitFor(() => expect(observed[0].aborted).toBe(true), { interval: 5 })
  expect((await fetch(url + '/api/engine/status').then((response) => response.json())).analyzing).toBe(false)
  expect(engine.analyze).toHaveBeenCalledTimes(2)
})

it('引擎超时返回 504 并允许再次发起分析', async () => {
  let timedOut = false
  const engine = fakeEngine((request) => {
    if (timedOut) return fakeAnalysis(request)
    timedOut = true
    throw new PikafishError('timeout', 'engine time limit')
  })
  const url = await listen(new EngineService(engine, true))
  const response = await post(url, 'analyze', standard)
  expect(response.status).toBe(504)
  expect(await response.json()).toMatchObject({ error: { code: 'timeout' } })
  expect((await post(url, 'analyze', { ...standard, requestId: 'retry' })).status).toBe(200)
})

it.each(['partial', 'terminal', 'rule-disagreement'] as const)('HTTP 保留 %s 结果', async (kind) => {
  const engine = fakeEngine(async (request) => ({ ...await fakeAnalysis(request), kind }))
  const url = await listen(new EngineService(engine, true))
  expect(await post(url, 'analyze', standard).then((response) => response.json()))
    .toMatchObject({ requestId: standard.requestId, kind })
})

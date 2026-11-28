import { Router, json } from 'express'
import type { HttpAnalysisRequest, SearchLimit } from '../../shared/analysis/types.ts'
import { maxArchiveMoves } from '../../shared/xiangqi/archive.ts'
import { ApiProblem } from '../apiProblem.ts'
import { engineLimits } from '../engine/config.ts'
import { isSquare } from '../engine/uciParser.ts'
import type { EngineService } from '../services/engineService.ts'

function invalid(message: string): never {
  throw new ApiProblem(400, 'invalid-request', message)
}

function shape(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) {
    invalid('请求包含未知字段或数据格式不正确。')
  }
  return value as Record<string, unknown>
}

function idOf(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || /[^a-z0-9_-]/i.test(value)) {
    invalid('请为本次分析提供有效的 requestId。')
  }
  return value
}

function numberInRange(value: unknown, label: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    invalid(`${label} 应为 1 至 ${maximum} 之间的整数。`)
  }
  return value
}

function analysisLimit(value: unknown): SearchLimit | undefined {
  if (value === undefined) return undefined
  const candidate = shape(value, ['kind', 'ms', 'depth', 'nodes'])
  if (Object.keys(candidate).length !== 2) invalid('请只提供一种搜索限制。')
  switch (candidate.kind) {
    case 'time': return { kind: 'time', ms: numberInRange(candidate.ms, '搜索时间 (ms)', engineLimits.moveTimeMs) }
    case 'depth': return { kind: 'depth', depth: numberInRange(candidate.depth, '搜索深度', engineLimits.depth) }
    case 'nodes': return { kind: 'nodes', nodes: numberInRange(candidate.nodes, '搜索节点数', engineLimits.nodes) }
    default: return invalid('请使用 time、depth 或 nodes 作为搜索限制。')
  }
}

function analysisRequest(body: unknown): HttpAnalysisRequest {
  const { requestId, initialFen, moves = [], limit, multiPv } = shape(body, ['requestId', 'initialFen', 'moves', 'limit', 'multiPv'])
  if (typeof initialFen !== 'string' || initialFen.trim() === '' || initialFen.length > 256 || /[^ -~]/.test(initialFen)) {
    invalid('起始 FEN 应为一行有效文本。')
  }
  if (!Array.isArray(moves) || moves.length > maxArchiveMoves) invalid(`历史着法必须是数组，且最多 ${maxArchiveMoves} 着。`)
  return {
    requestId: idOf(requestId),
    initialFen,
    moves: moves.map((move: unknown, index) => {
      const { from, to } = shape(move, ['from', 'to'])
      if (!isSquare(from) || !isSquare(to)) invalid(`第 ${index + 1} 着坐标无效，应为 a0 到 i9。`)
      return { from, to }
    }),
    limit: analysisLimit(limit),
    multiPv: multiPv === undefined ? undefined : numberInRange(multiPv, 'MultiPV', engineLimits.multiPv),
  }
}

export function engineRouter(service: EngineService) {
  const router = Router()
  const readJson = json({ limit: '64kb', inflate: false })
  router.get('/status', async (_request, response) => { response.json(await service.status()) })

  router.post(['/analyze', '/cancel'], (request, _response, next) => {
    if (!request.is('application/json')) {
      next(new ApiProblem(415, 'json-required', '请使用 application/json 发送请求。'))
      return
    }
    next()
  }, readJson)

  router.post('/analyze', async (request, response) => {
    const body = analysisRequest(request.body)
    if (response.destroyed) return
    const disconnected = new AbortController()
    const onClose = () => { if (!response.writableFinished) disconnected.abort() }
    response.once('close', onClose)
    try {
      const result = await service.analyze(body, disconnected.signal)
      if (!response.destroyed) response.json(result)
    } finally {
      response.off('close', onClose)
    }
  })

  router.post('/cancel', async (request, response) => {
    const { requestId } = shape(request.body, ['requestId'])
    response.json(await service.cancel(idOf(requestId)))
  })
  return router
}

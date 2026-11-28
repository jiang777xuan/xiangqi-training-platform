import type { AnalysisRequest, AnalysisResult, EngineStatus, HttpAnalysisRequest, HttpAnalysisResult } from '../../shared/analysis/types.ts'
import { createStandardGame } from '../../shared/xiangqi/index.ts'
import { ApiProblem, apiProblem } from '../apiProblem.ts'

interface AnalysisEngine {
  readonly version: string | null
  readonly ready?: boolean
  analyze(request: AnalysisRequest, options: { signal: AbortSignal }): Promise<AnalysisResult>
  close(): Promise<void>
}

const readyError = { code: 'engine-unavailable', message: '无法使用 Pikafish，请检查服务端配置、引擎和 NNUE 文件。' } as const
const missingError = { code: 'not-configured', message: '服务端尚未配置 Pikafish。' } as const
const recentRequestLimit = 512

export class EngineService {
  private readonly engine: AnalysisEngine | undefined
  private readonly configured: boolean
  private available = false
  private error: EngineStatus['error']
  private active?: { id: string; controller: AbortController; done: Promise<HttpAnalysisResult> }
  private probe?: { controller: AbortController; done: Promise<void> }
  private readonly recentIds = new Set<string>()
  private closed = false

  constructor(engine: AnalysisEngine | undefined, configured: boolean) {
    this.engine = engine
    this.configured = configured
    this.error = configured ? readyError : missingError
  }

  async status(): Promise<EngineStatus> {
    if (this.available && this.engine?.ready === false && !this.active && !this.probe) this.markUnavailable()
    if (this.engine && !this.closed && !this.available && !this.active) {
      if (!this.probe) {
        const engine = this.engine
        const controller = new AbortController()
        const done = Promise.resolve().then(async () => {
          try {
            const result = await engine.analyze(
              { initialFen: createStandardGame().toFen(), limit: { kind: 'depth', depth: 1 }, multiPv: 1 },
              { signal: controller.signal },
            )
            if (!result.bestMove) throw new Error('引擎探测未返回可用着法。')
            this.markAvailable()
          } catch {
            this.markUnavailable()
          } finally {
            this.probe = undefined
          }
        })
        this.probe = { controller, done }
      }
      await this.probe.done
    }
    return {
      configured: this.configured, available: this.available && !this.closed,
      version: this.engine?.version ?? null, analyzing: Boolean(this.active), error: this.error,
    }
  }

  async analyze(request: HttpAnalysisRequest, disconnected: AbortSignal): Promise<HttpAnalysisResult> {
    if (this.closed) throw new ApiProblem(503, 'engine-unavailable', '分析服务正在关闭。')
    if (!this.engine) {
      const error = this.configured ? readyError : missingError
      throw new ApiProblem(503, error.code, error.message)
    }
    if (this.recentIds.has(request.requestId)) throw new ApiProblem(409, 'duplicate-request', '请为每次分析使用新的请求编号。')
    if (this.active || this.probe) throw new ApiProblem(409, 'busy', '引擎正在处理另一项任务，请稍后重试。')

    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, disconnected])
    const { requestId, ...position } = request
    const engine = this.engine
    this.remember(requestId)
    const done = Promise.resolve().then(async () => {
      try {
        const result = await engine.analyze(position, { signal })
        if (signal.aborted) throw new ApiProblem(409, 'cancelled', '分析已取消。')
        if (result.kind !== 'terminal') this.markAvailable()
        return { requestId, ...result }
      } catch (error) {
        const problem = apiProblem(error)
        if (problem.code === 'engine-unavailable' || problem.code === 'engine-failed') this.markUnavailable()
        throw problem
      } finally {
        this.active = undefined
      }
    })
    this.active = { id: requestId, controller, done }
    return done
  }

  async cancel(id: string): Promise<{ requestId: string; cancelled: true }> {
    const task = this.active
    if (task?.id !== id) throw new ApiProblem(404, 'request-not-active', '指定的分析已结束或不存在。')
    task.controller.abort()
    // 直到引擎确认旧任务已结束才返回，避免下一次点击立刻遇到旧任务仍占用进程。
    await task.done.catch(() => undefined)
    return { requestId: id, cancelled: true }
  }

  async close(): Promise<void> {
    this.closed = true
    const active = this.active
    const probe = this.probe
    active?.controller.abort()
    probe?.controller.abort()
    await Promise.allSettled([active?.done, probe?.done])
    await this.engine?.close()
  }

  private remember(id: string) {
    if (this.recentIds.size >= recentRequestLimit) {
      const oldest = this.recentIds.values().next().value
      if (oldest !== undefined) this.recentIds.delete(oldest)
    }
    this.recentIds.add(id)
  }

  private markAvailable() {
    this.available = true
    this.error = null
  }

  private markUnavailable() {
    this.available = false
    this.error = readyError
  }
}

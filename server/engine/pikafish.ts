import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { checkInteger, engineLimits, goCommand, readPikafishConfig, validatePikafishConfig, type PikafishConfig } from './config.ts'
import { countLegalMoves, preparePosition } from './position.ts'
import { noSearchResult, verifyAnalysis } from './result.ts'
import { PikafishError, type AnalysisRequest, type AnalysisResult } from './types.ts'
import type { UciInfo, UciSpinOption } from './uciParser.ts'
import { UciProcess, cancelledError } from './uciProcess.ts'

export class PikafishEngine {
  private readonly config: PikafishConfig
  private process?: UciProcess
  private options = new Map<string, UciSpinOption>()
  private tail: Promise<void> = Promise.resolve()
  private active?: { controller: AbortController; done: Promise<void> }
  private closing?: Promise<void>

  constructor(config: PikafishConfig = readPikafishConfig()) {
    this.config = validatePikafishConfig(config)
  }

  async analyze(request: AnalysisRequest, { signal }: { signal?: AbortSignal } = {}): Promise<AnalysisResult> {
    if (this.closing) throw new PikafishError('closed', 'Pikafish 模块已关闭。')
    if (signal?.aborted) throw cancelledError()
    const position = preparePosition(request)
    const multiPv = checkInteger(request.multiPv === undefined ? this.config.multiPv : request.multiPv, 'MultiPV', engineLimits.multiPv)
    const go = goCommand(request.limit, this.config.moveTimeMs)
    if (position.game.getStatus().winner) return noSearchResult(position.game, multiPv)

    return new Promise((accept, reject) => {
      const cancelQueued = () => reject(cancelledError())
      signal?.addEventListener('abort', cancelQueued, { once: true })
      const task = this.tail.then(async () => {
        signal?.removeEventListener('abort', cancelQueued)
        if (this.closing) throw new PikafishError('closed', 'Pikafish 模块已关闭。')
        if (signal?.aborted) throw cancelledError()
        const controller = new AbortController()
        const taskSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
        const search = this.search(position, multiPv, go, taskSignal)
        this.active = { controller, done: search.then(() => {}, () => {}) }
        try { return await search }
        finally { this.active = undefined }
      })
      this.tail = task.then(() => {}, () => {})
      void task.then(accept, reject)
    })
  }

  /** 取消当前运行中的搜索，等旧回执或进程退出后才返回。 */
  async stop(): Promise<void> {
    const active = this.active
    active?.controller.abort()
    await active?.done
  }

  close(): Promise<void> {
    this.closing ??= this.finish()
    return this.closing
  }

  private async finish() {
    await this.stop()
    await this.tail
    await this.release()
  }

  private async release(force = false) {
    await this.process?.shutdown(force)
    this.process = undefined
    this.options.clear()
  }

  private optionCommand(name: string, value: number, required = false): string[] {
    const option = this.options.get(name.toLowerCase())
    if (!option) {
      if (required) throw new PikafishError('configuration', `引擎未声明支持 ${name}。`)
      return []
    }
    if (value < option.min || value > option.max) {
      throw new PikafishError('configuration', `此引擎的 ${name} 必须在 ${option.min} 到 ${option.max} 之间。`)
    }
    return [`setoption name ${name} value ${value}`]
  }

  private async open(signal: AbortSignal): Promise<UciProcess> {
    if (this.process?.reusable) return this.process
    if (this.process) await this.release(true)
    if (!this.config.path) throw new PikafishError('configuration', '请通过 PIKAFISH_PATH 设置引擎可执行文件路径。')
    const path = resolve(this.config.path)
    try {
      if (!(await stat(path)).isFile()) throw new Error('路径不是文件')
    } catch (cause) {
      throw new PikafishError('launch', `找不到可执行文件：${path}`, { cause })
    }
    if (signal.aborted) throw cancelledError()

    let process: UciProcess
    try { process = new UciProcess(path) }
    catch (cause) { throw new PikafishError('launch', `无法启动 Pikafish：${path}`, { cause }) }
    this.process = process
    try {
      await process.request(['uci'], 'uciok', this.config.hardTimeoutMs, signal, (message) => {
        if (message.kind === 'spin-option') this.options.set(message.name.toLowerCase(), message)
      })
      const settings = [...this.optionCommand('Threads', this.config.threads), ...this.optionCommand('Hash', this.config.hashMb)]
      await process.request([...settings, 'isready'], 'readyok', this.config.hardTimeoutMs, signal)
      return process
    } catch (error) {
      await this.release(true)
      throw error
    }
  }

  private async search(position: ReturnType<typeof preparePosition>, multiPv: number, go: string, signal: AbortSignal) {
    const process = await this.open(signal)
    try {
      const multiPvOption = this.optionCommand('MultiPV', multiPv, multiPv > 1)
      await process.request(['ucinewgame', ...multiPvOption, 'isready'], 'readyok', this.config.hardTimeoutMs, signal)
      const expected = Math.min(multiPv, countLegalMoves(position.game))
      const candidates = new Map<number, UciInfo>()
      let depth = -1
      const start = performance.now()
      const reply = await process.request([position.command, go], 'bestmove', this.config.hardTimeoutMs, signal, (message) => {
        if (message.kind !== 'info' || message.multipv > expected || message.depth < depth) return
        if (message.depth > depth) {
          depth = message.depth
          candidates.clear()
        }
        candidates.set(message.multipv, message)
      })
      if (reply.kind !== 'bestmove') {
        await this.release(true)
        throw new PikafishError('protocol', '引擎返回了无法解析的 bestmove。')
      }
      return verifyAnalysis(position.game, reply, candidates, multiPv, expected, Math.round(performance.now() - start))
    } catch (error) {
      if (!process.reusable && this.process === process) await this.release(true)
      throw error
    }
  }
}

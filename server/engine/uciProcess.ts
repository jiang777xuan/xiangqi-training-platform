import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { PikafishError } from './types.ts'
import { parseUciLine, type UciMessage } from './uciParser.ts'

const stopGraceMs = 500
const fatalDiagnostic = /^(?:info string\s+)?(?:CRITICAL ERROR\b|ERROR:)/i

type Reply = 'uciok' | 'readyok' | 'bestmove'

export function cancelledError() {
  return new PikafishError('cancelled', 'Pikafish 请求已取消。')
}

export class UciProcess {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly closed: Promise<void>
  private isClosed = false
  private started = false
  private failure?: PikafishError
  private stderr = ''
  private waiter?: { receive: (message: UciMessage) => void; reject: (error: PikafishError) => void }

  constructor(path: string) {
    this.child = spawn(path, [], { cwd: dirname(path), shell: false, windowsHide: true, stdio: 'pipe' })
    const output = createInterface({ input: this.child.stdout, crlfDelay: Infinity })
    const onStderr = (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-4096) }
    const onError = (cause: Error) => this.fail(new PikafishError(
      this.started ? 'exited' : 'launch', `Pikafish 进程通信失败：${cause.message}`, { cause },
    ))
    const onLine = (line: string) => {
      if (fatalDiagnostic.test(line.trimStart())) {
        this.fail(new PikafishError('engine-error', `Pikafish 报错：${line.trim()}`))
        return
      }
      const message = parseUciLine(line)
      if (message) this.waiter?.receive(message)
    }
    const onSpawn = () => { this.started = true }
    this.child.once('spawn', onSpawn)
    this.child.on('error', onError)
    this.child.stdin.on('error', onError)
    this.child.stdout.on('error', onError)
    this.child.stderr.setEncoding('utf8').on('data', onStderr).on('error', onError)
    output.on('line', onLine).on('error', onError)
    this.closed = new Promise((resolve) => {
      this.child.once('close', (code, signal) => {
        this.isClosed = true
        const detail = this.stderr.trim()
        this.fail(new PikafishError(
          /(?:NNUE|network evaluation).*(?:fail|not loaded|must be available)/i.test(detail) ? 'engine-error' : 'exited',
          `Pikafish 进程已退出（${code ?? signal ?? '未知状态'}）。${detail ? ` ${detail}` : ''}`,
        ))
        output.off('line', onLine).off('error', onError).close()
        this.child.off('spawn', onSpawn)
        this.child.off('error', onError)
        this.child.stdin.off('error', onError)
        this.child.stdout.off('error', onError)
        this.child.stderr.off('data', onStderr).off('error', onError)
        resolve()
      })
    })
  }

  get reusable() {
    return !this.isClosed && !this.failure
  }

  private fail(error: PikafishError) {
    this.failure ??= error
    this.waiter?.reject(this.failure)
  }

  private send(command: string) {
    if (!this.child.stdin.writable) throw new PikafishError('exited', 'Pikafish 的输入管道已关闭。')
    this.child.stdin.write(command + '\n')
  }

  request(
    commands: readonly string[],
    reply: Reply,
    timeoutMs: number,
    signal: AbortSignal,
    onMessage?: (message: UciMessage) => void,
  ): Promise<UciMessage> {
    if (signal.aborted) return Promise.reject(cancelledError())
    if (this.failure) return Promise.reject(this.failure)
    if (this.waiter) return Promise.reject(new PikafishError('protocol', '上一项 UCI 请求仍在等待回执。'))

    return new Promise((resolve, reject) => {
      let interruption: PikafishError | undefined
      let timer: ReturnType<typeof setTimeout>
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        this.waiter = undefined
      }
      const rejectRequest = (error: PikafishError) => {
        cleanup()
        reject(interruption ?? error)
      }
      const abort = () => interrupt(cancelledError())
      const interrupt = (error: PikafishError) => {
        if (interruption) return
        interruption = error
        if (reply !== 'bestmove') {
          this.fail(error)
          return
        }
        // stop 没有独立回执。等这一轮的 bestmove，才允许向同一进程发下一轮 go。
        clearTimeout(timer)
        timer = setTimeout(() => this.fail(error), stopGraceMs)
        send('stop')
      }
      const send = (command: string) => {
        try { this.send(command) }
        catch (cause) { this.fail(new PikafishError('exited', '无法向 Pikafish 写入指令。', { cause })) }
      }
      const receive = (message: UciMessage) => {
        if (message.kind === reply || (reply === 'bestmove' && message.kind === 'invalid-bestmove')) {
          if (interruption) {
            if (message.kind === 'invalid-bestmove') this.fail(interruption)
            else rejectRequest(interruption)
          } else {
            cleanup()
            resolve(message)
          }
        } else if (!interruption) {
          onMessage?.(message)
        }
      }
      this.waiter = { receive, reject: rejectRequest }
      signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => interrupt(new PikafishError('timeout', `等待 Pikafish ${reply} 超时（${timeoutMs} ms）。`)), timeoutMs)
      for (const command of commands) {
        if (!this.waiter) break
        send(command)
      }
    })
  }

  private waitForClose(ms: number): Promise<boolean> {
    if (this.isClosed) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms)
      void this.closed.then(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  async shutdown(force = false): Promise<void> {
    if (this.isClosed) return
    if (!force && this.reusable) {
      try {
        this.send('quit')
        this.child.stdin.end()
      } catch {
        // 输入管道已不可用，走强制退出流程。
      }
      if (await this.waitForClose(stopGraceMs)) return
    }
    this.child.kill()
    if (!await this.waitForClose(stopGraceMs)) {
      throw new PikafishError('exited', '无法确认旧 Pikafish 进程已经退出。')
    }
  }
}

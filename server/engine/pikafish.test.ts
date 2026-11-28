import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { dirname, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createStandardGame } from '../../shared/xiangqi/index.ts'
import { readPikafishConfig, type PikafishConfig } from './config.ts'
import { PikafishEngine } from './pikafish.ts'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const initialFen = createStandardGame().toFen()
const demoFen = '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
const single = { initialFen, limit: { kind: 'depth', depth: 10 } } as const
const config = readPikafishConfig({ PIKAFISH_PATH: process.execPath })
const options = [
  'id name Fake Pikafish',
  'option name Threads type spin default 1 min 1 max 1024',
  'option name Hash type spin default 16 min 1 max 1024',
  'option name MultiPV type spin default 1 min 1 max 128',
  'uciok',
]
const openingLine = 'info depth 10 seldepth 12 multipv 1 score cp 31 nodes 1024 nps 48000 time 12 pv b2e2 b9c7'

type Handler = (command: string, process: MockEngine) => true | void

class MockEngine extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly commands: string[] = []
  ended = false
  readonly kill = vi.fn(() => { this.exit(null, 'SIGTERM'); return true })

  constructor(handler?: Handler) {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      const command = chunk.toString('utf8').trimEnd()
      this.commands.push(command)
      if (handler?.(command, this)) return
      if (command === 'uci') this.write(...options)
      if (command === 'isready') this.write('readyok')
      if (command.startsWith('go ')) this.write(openingLine, 'bestmove b2e2 ponder b9c7')
      if (command === 'quit') this.exit(0)
    })
  }

  write(...lines: string[]) {
    this.stdout.write(lines.join('\r\n') + '\r\n')
  }

  exit(code: number | null, signal: string | null = null) {
    if (this.ended) return
    this.ended = true
    this.stdout.end()
    this.stderr.end()
    this.stdin.end()
    queueMicrotask(() => this.emit('close', code, signal))
  }
}

function mockSpawn(handler?: Handler) {
  const fake = new MockEngine(handler)
  vi.mocked(spawn).mockImplementationOnce(() => {
    queueMicrotask(() => fake.emit('spawn'))
    return fake as unknown as ReturnType<typeof spawn>
  })
  return fake
}

const createdEngines: PikafishEngine[] = []
function createEngine(overrides: Partial<PikafishConfig> = {}) {
  const engine = new PikafishEngine({ ...config, ...overrides })
  createdEngines.push(engine)
  return engine
}

async function untilCommand(process: MockEngine, command: string) {
  await vi.waitFor(() => expect(process.commands).toContain(command), { interval: 5 })
}

beforeEach(() => vi.mocked(spawn).mockReset())
afterEach(async () => {
  await Promise.all(createdEngines.splice(0).map((engine) => engine.close()))
})

it('握手后依序设置参数，在无 shell 的进程中处理分段输出和连在一起的多行', async () => {
  const fake = mockSpawn((command, child) => {
    if (command === 'uci') {
      child.stdout.write(options.slice(0, -1).join('\r\n') + '\r\nuci')
      queueMicrotask(() => child.stdout.write('ok\r\n'))
      return true
    }
    if (command.startsWith('go ')) {
      child.stderr.write('nonfatal diagnostic\n')
      child.stdout.write(openingLine + '\r\nbestmo')
      queueMicrotask(() => child.stdout.write('ve b2e2 ponder b9c7\r\n'))
      return true
    }
  })
  const engine = createEngine()
  const result = await engine.analyze(single)
  expect(spawn).toHaveBeenCalledWith(process.execPath, [], expect.objectContaining({
    cwd: dirname(process.execPath), shell: false, windowsHide: true, stdio: 'pipe',
  }))
  expect(fake.commands).toEqual([
    'uci', 'setoption name Threads value 4', 'setoption name Hash value 128', 'isready',
    'ucinewgame', 'setoption name MultiPV value 1', 'isready', `position fen ${initialFen}`, 'go depth 10',
  ])
  expect(result).toMatchObject({
    kind: 'analysis', bestMove: { from: 'b2', to: 'e2', notation: '炮八平五' }, ponder: { from: 'b9', to: 'c7' },
    variations: [{ depth: 10, score: { sideToMove: 'red', red: { kind: 'cp', value: 31 } } }],
  })
})

it('串行运行并按编号返回 MultiPV，再恢复单候选搜索且不沿用旧候选', async () => {
  let search = 0
  const fake = mockSpawn((command, child) => {
    if (!command.startsWith('go ')) return
    search += 1
    if (search === 1) return true
    child.write('info depth 6 multipv 1 score cp 17 pv g3g4', 'bestmove g3g4')
    return true
  })
  const engine = createEngine()
  const first = engine.analyze({ ...single, multiPv: 3 })
  const second = engine.analyze({ ...single, limit: { kind: 'nodes', nodes: 1000 } })
  await untilCommand(fake, 'go depth 10')
  expect(fake.commands).not.toContain('go nodes 1000')
  fake.write(
    'info depth 10 multipv 3 score cp 12 pv g3g4',
    'info depth 10 multipv 2 score cp 20 pv h2e2',
    openingLine, 'bestmove b2e2',
  )
  const firstResult = await first
  const secondResult = await second
  expect(firstResult.kind).toBe('analysis')
  expect(firstResult.variations.map(({ multipv }) => multipv)).toEqual([1, 2, 3])
  expect(secondResult).toMatchObject({ kind: 'analysis', depth: 6, bestMove: { from: 'g3', to: 'g4' } })
  expect(secondResult.variations).toHaveLength(1)
  expect(fake.commands.filter((command) => command.startsWith('setoption name MultiPV'))).toEqual([
    'setoption name MultiPV value 3', 'setoption name MultiPV value 1',
  ])
  expect(spawn).toHaveBeenCalledTimes(1)
})

it('多候选的最后一层不完整时，明确标记 partial，且不借用上一层的数据', async () => {
  mockSpawn((command, child) => {
    if (!command.startsWith('go ')) return
    child.write(
      'info depth 9 multipv 1 score cp 18 pv b2e2',
      'info depth 9 multipv 2 score cp 13 pv h2e2',
      openingLine, 'bestmove b2e2',
    )
    return true
  })
  const result = await createEngine().analyze({ ...single, multiPv: 2 })
  expect(result).toMatchObject({ kind: 'partial', expectedMultiPv: 2, depth: 10 })
  expect(result.variations.map(({ depth, multipv }) => [depth, multipv])).toEqual([[10, 1]])
  expect(result.warnings.join(' ')).toContain('不完整')
})

it('拒绝坐标格式正确但棋局非法的引擎推荐', async () => {
  mockSpawn((command, child) => {
    if (command !== 'go depth 10') return
    child.write('bestmove b2c3 ponder b9c7')
    return true
  })
  await expect(createEngine().analyze(single)).rejects.toMatchObject({ code: 'invalid-bestmove' })
})

it('略过后续着法非法的整条 PV 和非法 ponder，保留合法最佳着法', async () => {
  mockSpawn((command, child) => {
    if (command !== 'go depth 10') return
    child.write('info depth 10 score cp 31 pv b2e2 b0c2', 'bestmove b2e2 ponder b0c2')
    return true
  })
  const result = await createEngine().analyze(single)
  expect(result).toMatchObject({ kind: 'partial', bestMove: { from: 'b2' }, ponder: null, variations: [] })
  expect(result.warnings.join(' ')).toContain('第 2 着非法')
})

it('引擎在有合法走法时报告无着法，返回裁决差异并保留项目状态', async () => {
  mockSpawn((command, child) => {
    if (command !== 'go depth 10') return
    child.write('bestmove (none)')
    return true
  })
  const result = await createEngine().analyze(single)
  expect(result).toMatchObject({ kind: 'rule-disagreement', status: { kind: 'normal', winner: null }, bestMove: null, variations: [] })
  expect(result.warnings[0]).toContain('项目规则仍有合法走法')
})

it('找不到引擎路径时报告清晰错误，且不启动进程', async () => {
  const engine = createEngine({ path: resolve('nonexistent Pikafish folder', 'engine.exe') })
  await expect(engine.analyze(single)).rejects.toMatchObject({ code: 'launch', message: expect.stringContaining('找不到可执行文件') })
  expect(spawn).not.toHaveBeenCalled()
})

it('报告进程启动失败且清理管道', async () => {
  vi.mocked(spawn).mockImplementationOnce(() => {
    throw new Error('EACCES')
  })
  await expect(createEngine().analyze(single)).rejects.toMatchObject({ code: 'launch' })
})

it('引擎训练权重加载失败时返回错误并结束失效进程', async () => {
  const fake = mockSpawn((command, child) => {
    if (command !== 'go depth 10') return
    child.write('info string ERROR: Network evaluation parameters compatible with the engine must be available.')
    return true
  })
  await expect(createEngine().analyze(single)).rejects.toMatchObject({ code: 'engine-error', message: expect.stringContaining('Network evaluation') })
  expect(fake.kill).toHaveBeenCalledOnce()
})

it('搜索期间引擎意外退出时保留 stderr，下一次请求重启', async () => {
  mockSpawn((command, child) => {
    if (command !== 'go depth 10') return
    child.stderr.write('crashed during search\n')
    child.exit(9)
    return true
  })
  const next = mockSpawn()
  const engine = createEngine()
  await expect(engine.analyze(single)).rejects.toMatchObject({ code: 'exited', message: expect.stringContaining('crashed during search') })
  await expect(engine.analyze(single)).resolves.toMatchObject({ kind: 'analysis' })
  expect(next.commands).toContain('uci')
  expect(spawn).toHaveBeenCalledTimes(2)
})

it('超时先发 stop，等不到旧 bestmove 就杀掉进程再开始下一项', async () => {
  const first = mockSpawn((command) => {
    if (command === 'go depth 10') return true
  })
  const next = mockSpawn()
  const engine = createEngine({ hardTimeoutMs: 120 })
  const timedOut = engine.analyze(single)
  const later = engine.analyze(single)
  await expect(timedOut).rejects.toMatchObject({ code: 'timeout' })
  expect(first.commands).toContain('stop')
  expect(first.kill).toHaveBeenCalledOnce()
  expect(first.ended).toBe(true)
  await expect(later).resolves.toMatchObject({ kind: 'analysis' })
  expect(next.commands).toContain('go depth 10')
})

it('取消后等待旧搜索回执，再复用进程，旧 bestmove 不进入新结果', async () => {
  let search = 0
  const fake = mockSpawn((command, child) => {
    if (!command.startsWith('go ')) return
    if (++search === 1) return true
    child.write('info depth 4 score cp 20 pv g3g4', 'bestmove g3g4')
    return true
  })
  const engine = createEngine()
  const controller = new AbortController()
  const cancelled = engine.analyze(single, { signal: controller.signal })
  const assertion = expect(cancelled).rejects.toMatchObject({ code: 'cancelled' })
  const second = engine.analyze({ ...single, limit: { kind: 'depth', depth: 4 } })
  await untilCommand(fake, 'go depth 10')
  controller.abort()
  await untilCommand(fake, 'stop')
  expect(fake.commands).not.toContain('go depth 4')
  fake.write(openingLine, 'bestmove b2e2')
  await assertion
  await expect(second).resolves.toMatchObject({ depth: 4, bestMove: { from: 'g3', to: 'g4' } })
  expect(fake.kill).not.toHaveBeenCalled()
  expect(spawn).toHaveBeenCalledTimes(1)
})

it('排队中的任务可独立取消，不向引擎发出额外搜索指令', async () => {
  const fake = mockSpawn((command) => {
    if (command === 'go depth 10') return true
  })
  const engine = createEngine()
  const active = engine.analyze(single)
  const controller = new AbortController()
  const queued = engine.analyze({ ...single, multiPv: 2 }, { signal: controller.signal })
  controller.abort()
  await expect(queued).rejects.toMatchObject({ code: 'cancelled' })
  await untilCommand(fake, 'go depth 10')
  fake.write(openingLine, 'bestmove b2e2')
  await active
  expect(fake.commands.filter((command) => command.startsWith('go '))).toHaveLength(1)
  expect(fake.commands).not.toContain('stop')
})

it('关闭时取消当前搜索，发送 quit，释放监听器并拒绝新请求', async () => {
  const fake = mockSpawn((command, child) => {
    if (command === 'go depth 10') return true
    if (command === 'stop') child.write('bestmove b2e2')
  })
  const engine = createEngine()
  const run = engine.analyze(single)
  const rejected = expect(run).rejects.toMatchObject({ code: 'cancelled' })
  await untilCommand(fake, 'go depth 10')
  await engine.close()
  await rejected
  expect(fake.commands.slice(-2)).toEqual(['stop', 'quit'])
  expect(fake.listenerCount('error')).toBe(0)
  expect(fake.stdout.listenerCount('data')).toBe(0)
  expect(fake.stdout.listenerCount('error')).toBe(0)
  expect(fake.stderr.listenerCount('data')).toBe(0)
  expect(fake.stdin.listenerCount('error')).toBe(0)
  expect(fake.kill).not.toHaveBeenCalled()
  await expect(engine.analyze(single)).rejects.toMatchObject({ code: 'closed' })
})

it('重放历史得到将死或困毙的终局时，不需要启动或安装引擎', async () => {
  const engine = new PikafishEngine(readPikafishConfig({}))
  createdEngines.push(engine)
  for (const [to, kind] of [['b9', 'checkmate'], ['f7', 'stalemate']] as const) {
    await expect(engine.analyze({ initialFen: demoFen, moves: [{ from: 'b7', to }] })).resolves.toMatchObject({
      kind: 'terminal', bestMove: null, variations: [], status: { kind, winner: 'red' }, depth: null, elapsedMs: 0,
    })
  }
  expect(spawn).not.toHaveBeenCalled()
})

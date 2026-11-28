import { PikafishError, type SearchLimit } from './types.ts'

export const engineLimits = {
  threads: 32, hashMb: 1024, multiPv: 10, moveTimeMs: 30_000,
  hardTimeoutMs: 60_000, depth: 60, nodes: 100_000_000,
} as const

export interface PikafishConfig {
  readonly path?: string
  readonly threads: number
  readonly hashMb: number
  readonly multiPv: number
  readonly moveTimeMs: number
  readonly hardTimeoutMs: number
}

export function checkInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new PikafishError('configuration', `${name} 必须是 1 到 ${max} 之间的整数。`)
  }
  return value
}

export function validatePikafishConfig(config: PikafishConfig): PikafishConfig {
  return {
    path: config.path?.trim(),
    threads: checkInteger(config.threads, 'Threads', engineLimits.threads),
    hashMb: checkInteger(config.hashMb, 'Hash (MB)', engineLimits.hashMb),
    multiPv: checkInteger(config.multiPv, 'MultiPV', engineLimits.multiPv),
    moveTimeMs: checkInteger(config.moveTimeMs, '搜索时间 (ms)', engineLimits.moveTimeMs),
    hardTimeoutMs: checkInteger(config.hardTimeoutMs, '硬超时 (ms)', engineLimits.hardTimeoutMs),
  }
}

export function readPikafishConfig(env: NodeJS.ProcessEnv = process.env): PikafishConfig {
  function setting(name: string, fallback: number) {
    const value = env[name]?.trim()
    if (!value) return fallback
    if (!/^\d+$/.test(value)) throw new PikafishError('configuration', `${name} 必须是整数。`)
    return Number(value)
  }

  return validatePikafishConfig({
    path: env.PIKAFISH_PATH,
    threads: setting('PIKAFISH_THREADS', 4),
    hashMb: setting('PIKAFISH_HASH_MB', 128),
    multiPv: setting('PIKAFISH_MULTIPV', 1),
    moveTimeMs: setting('PIKAFISH_MOVE_TIME_MS', 1000),
    hardTimeoutMs: setting('PIKAFISH_HARD_TIMEOUT_MS', 10_000),
  })
}

export function goCommand(limit: SearchLimit | undefined, defaultMoveTimeMs: number): string {
  if (limit === undefined) return `go movetime ${defaultMoveTimeMs}`
  switch (limit?.kind) {
    case 'time': return `go movetime ${checkInteger(limit.ms, '搜索时间 (ms)', engineLimits.moveTimeMs)}`
    case 'depth': return `go depth ${checkInteger(limit.depth, '搜索深度', engineLimits.depth)}`
    case 'nodes': return `go nodes ${checkInteger(limit.nodes, '搜索节点数', engineLimits.nodes)}`
    default: throw new PikafishError('configuration', '未知的搜索限制类型。')
  }
}

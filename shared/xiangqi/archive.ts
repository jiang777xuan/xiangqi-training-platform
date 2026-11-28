import { createGameFromFen, type XiangqiGame, type XiangqiMove, type XiangqiSquare } from './index.ts'

export const maxArchiveSize = 256 * 1024
export const maxArchiveMoves = 2000

export interface GameArchive {
  readonly version: 1
  readonly initialFen: string
  readonly moves: readonly XiangqiMove[]
  readonly name?: string
  readonly savedAt?: string
}

export interface LoadedArchive {
  readonly archive: GameArchive
  readonly game: XiangqiGame
}

function checkSize(bytes: number) {
  if (bytes > maxArchiveSize) throw new Error('棋谱文件大小不能超过 256 KiB。')
}

function checkMoveCount(count: number) {
  if (count > maxArchiveMoves) throw new Error(`棋谱不能超过 ${maxArchiveMoves} 着。`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSquare(value: unknown): value is XiangqiSquare {
  return typeof value === 'string' && /^[a-i][0-9]$/.test(value)
}

function isSavedAt(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 27) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

/** 在独立棋局中重放着法，保留历史、记谱和重复局面信息。 */
export function rebuildGame(initialFen: string, moves: readonly XiangqiMove[], recordPosition?: (fen: string) => void) {
  let game: XiangqiGame
  try {
    game = createGameFromFen(initialFen)
  } catch (error) {
    throw new Error('起始 FEN 无效，请检查棋盘布局和行棋方。', { cause: error })
  }
  recordPosition?.(game.toFen())

  for (const [index, move] of moves.entries()) {
    if (!game.tryMove(move)) {
      throw new Error(`第 ${index + 1} 着非法（${move.from} → ${move.to}）。`)
    }
    recordPosition?.(game.toFen())
  }

  return game
}

/** 在独立棋局重放，返回从第 0 着开始的局面快照。 */
export function replayPositions(initialFen: string, moves: readonly XiangqiMove[]): readonly string[] {
  const positions: string[] = []
  rebuildGame(initialFen, moves, (fen) => positions.push(fen))
  return positions
}

export function serializeGameArchive(initialFen: string, moves: readonly XiangqiMove[], name?: string): string {
  checkMoveCount(moves.length)
  const archive: GameArchive = {
    version: 1,
    initialFen,
    moves: moves.map(({ from, to }) => ({ from, to })),
    name,
    savedAt: new Date().toISOString(),
  }
  const json = JSON.stringify(archive, null, 2)
  checkSize(new TextEncoder().encode(json).byteLength)
  return json
}

export function loadGameArchive(text: string): LoadedArchive {
  checkSize(new TextEncoder().encode(text).byteLength)

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error('无法读取 JSON，请选择 Xiangqi Master 导出的棋谱文件。', { cause: error })
  }

  if (!isRecord(data) || typeof data.version !== 'number') {
    throw new Error('棋谱结构无效，缺少有效的版本号。')
  }
  if (data.version !== 1) throw new Error('当前仅支持版本 1 的棋谱。')
  if (typeof data.initialFen !== 'string' || !data.initialFen.trim()) {
    throw new Error('棋谱缺少起始 FEN。')
  }
  if (!Array.isArray(data.moves)) throw new Error('棋谱缺少着法数组。')
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 120)) {
    throw new Error('棋局名称应为不超过 120 字符的文本。')
  }
  if (data.savedAt !== undefined && !isSavedAt(data.savedAt)) {
    throw new Error('保存时间应为 ISO UTC 字符串，例如 2026-11-27T12:00:00.000Z。')
  }

  checkMoveCount(data.moves.length)
  const moves = data.moves.map((move: unknown, index): XiangqiMove => {
    if (!isRecord(move) || !isSquare(move.from) || !isSquare(move.to)) {
      throw new Error(`第 ${index + 1} 着的坐标无效，应为 a0 到 i9 之间的棋盘交点。`)
    }
    return { from: move.from, to: move.to }
  })
  const archive: GameArchive = {
    version: 1,
    initialFen: data.initialFen,
    moves,
    name: data.name,
    savedAt: data.savedAt,
  }

  return { archive, game: rebuildGame(archive.initialFen, moves) }
}

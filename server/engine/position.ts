import type { XiangqiGame, XiangqiMove, XiangqiMoveRecord, XiangqiSquare } from '../../shared/xiangqi/index.ts'
import { maxArchiveMoves, rebuildGame } from '../../shared/xiangqi/archive.ts'
import { PikafishError, type AnalysisRequest } from './types.ts'
import { isSquare } from './uciParser.ts'

export function preparePosition({ initialFen, moves = [] }: AnalysisRequest) {
  if (typeof initialFen !== 'string' || initialFen.length > 256 || /[^ -~]/.test(initialFen)
    || initialFen.trim() === '') {
    throw new PikafishError('position', '起始 FEN 必须是有效的单行文本。')
  }
  if (!Array.isArray(moves) || moves.length > maxArchiveMoves) {
    throw new PikafishError('position', `历史着法必须是数组，且最多 ${maxArchiveMoves} 着。`)
  }
  const coordinates = Array.from(moves, (move: XiangqiMove, index): XiangqiMove => {
    const from = move?.from
    const to = move?.to
    if (!isSquare(from) || !isSquare(to)) {
      throw new PikafishError('position', `第 ${index + 1} 着坐标无效，应为 a0 到 i9。`)
    }
    return { from, to }
  })
  let canonicalInitialFen: string | undefined
  let game: XiangqiGame
  try {
    game = rebuildGame(initialFen, coordinates, (fen) => { canonicalInitialFen ??= fen })
  } catch (error) {
    throw new PikafishError('position', error instanceof Error ? error.message : '引擎局面无效。', { cause: error })
  }
  const fen = game.toFen()
  const normalizedStart = canonicalInitialFen ?? fen
  const counters = normalizedStart.split(' ').slice(-2)
  if (counters.some((value) => Number(value) > 1_000_000)) {
    throw new PikafishError('position', 'FEN 的回合计数不能超过 1000000。')
  }
  const history = coordinates.map(({ from, to }) => from + to).join(' ')
  const command = `position fen ${normalizedStart}${history ? ` moves ${history}` : ''}`
  return { game, fen, command }
}

export function countLegalMoves(game: XiangqiGame): number {
  const turn = game.getTurn()
  let count = 0
  for (const [row, pieces] of game.getBoard().entries()) {
    for (const [column, piece] of pieces.entries()) {
      if (piece?.side !== turn) continue
      const square = `${'abcdefghi'[column]}${9 - row}` as XiangqiSquare
      count += game.getLegalMoves(square).length
    }
  }
  return count
}

/** 在已经独立重放过的棋局上验证一条变化，并恢复其完整历史。 */
export function verifyLine(game: XiangqiGame, moves: readonly XiangqiMove[]):
  { readonly records: readonly XiangqiMoveRecord[] } | { readonly illegalAt: number } {
  const start = game.getMoveHistory().length
  let applied = 0
  try {
    for (const move of moves) {
      if (!game.tryMove(move)) return { illegalAt: applied + 1 }
      applied += 1
    }
    return { records: game.getMoveHistory().slice(start) }
  } finally {
    while (applied > 0) {
      game.undoMove()
      applied -= 1
    }
  }
}

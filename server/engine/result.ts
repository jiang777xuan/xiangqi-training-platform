import type { XiangqiGame } from '../../shared/xiangqi/index.ts'
import { verifyLine } from './position.ts'
import { PikafishError, type AnalysisResult, type AnalysisVariation } from './types.ts'
import { withScorePerspective, type UciBestMove, type UciInfo } from './uciParser.ts'

export function noSearchResult(game: XiangqiGame, requestedMultiPv: number): AnalysisResult {
  return {
    kind: 'terminal',
    fen: game.toFen(),
    status: game.getStatus(),
    sideToMove: game.getTurn(),
    requestedMultiPv,
    expectedMultiPv: 0,
    depth: null,
    elapsedMs: 0,
    bestMove: null,
    ponder: null,
    variations: [],
    warnings: [],
  }
}

export function verifyAnalysis(
  game: XiangqiGame,
  reply: UciBestMove,
  info: ReadonlyMap<number, UciInfo>,
  requestedMultiPv: number,
  expectedMultiPv: number,
  elapsedMs: number,
): AnalysisResult {
  const base = { fen: game.toFen(), status: game.getStatus(), sideToMove: game.getTurn(), requestedMultiPv, expectedMultiPv, elapsedMs }
  if (!reply.move) {
    return {
      ...base, kind: 'rule-disagreement', depth: null, bestMove: null, ponder: null, variations: [],
      warnings: ['引擎报告无可走着法，但项目规则仍有合法走法。项目的局面状态和胜负保持原样。'],
    }
  }

  const best = verifyLine(game, [reply.move])
  if ('illegalAt' in best) {
    throw new PikafishError('invalid-bestmove', `引擎推荐的着法 ${reply.move.from} → ${reply.move.to} 在当前局面非法。`)
  }
  const bestMove = best.records[0]
  const warnings: string[] = []
  let ponder = null
  if (reply.ponder) {
    const line = verifyLine(game, [reply.move, reply.ponder])
    if ('illegalAt' in line) warnings.push('引擎给出的 ponder 应手非法，已略过。')
    else ponder = line.records[1]
  }

  const candidates = [...info.values()].sort((a, b) => a.multipv - b.multipv)
  const variations: AnalysisVariation[] = []
  const roots = new Set<string>()
  for (const { pv, score, depth, seldepth, multipv, nodes, nps, timeMs } of candidates) {
    const line = verifyLine(game, pv)
    if ('illegalAt' in line) {
      warnings.push(`候选 ${multipv} 的第 ${line.illegalAt} 着非法，已略过整条变化。`)
      continue
    }
    const firstMove = line.records[0]
    const root = firstMove.from + firstMove.to
    if (roots.has(root)) {
      warnings.push(`候选 ${multipv} 的起手重复，已略过。`)
      continue
    }
    roots.add(root)
    variations.push({ depth, seldepth, multipv, nodes, nps, timeMs, score: withScorePerspective(score, base.sideToMove), pv: line.records })
  }

  const ranksComplete = variations.length === expectedMultiPv && variations.every((item, index) => item.multipv === index + 1)
  const principal = variations[0]?.pv[0]
  const matchesBest = principal?.from === bestMove.from && principal.to === bestMove.to
  if (!ranksComplete) warnings.push('最新搜索深度的候选变化不完整。')
  if (principal && !matchesBest) warnings.push('候选首着与引擎最终推荐不同。')
  return {
    ...base, kind: ranksComplete && matchesBest ? 'analysis' : 'partial',
    depth: candidates[0]?.depth ?? null, bestMove, ponder, variations, warnings,
  }
}

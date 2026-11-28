import assert from 'node:assert/strict'
import { createStandardGame, type XiangqiMoveRecord } from '../shared/xiangqi/index.ts'
import { PikafishEngine } from '../server/engine/pikafish.ts'
import type { AnalysisRequest, AnalysisResult, UciScore } from '../server/engine/types.ts'

const engine = new PikafishEngine()
const standard = createStandardGame().toFen()
const demo = '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
const limit = { kind: 'depth', depth: 10 } as const

function moveText(move: XiangqiMoveRecord | null) {
  if (!move) return '无'
  const coordinates = `${move.from}→${move.to}`
  return move.notation ? `${coordinates}（${move.notation}）` : coordinates
}

function scoreText({ kind, value, bound }: UciScore) {
  return `${kind} ${value}${bound === 'exact' ? '' : ` ${bound}`}`
}

async function analyze(label: string, request: AnalysisRequest): Promise<AnalysisResult> {
  const result = await engine.analyze({ limit, multiPv: 1, ...request })
  console.log(`\n${label} | ${result.kind} | ${result.sideToMove === 'red' ? '红方' : '黑方'}行棋 | ${result.elapsedMs} ms`)
  console.log(`FEN ${result.fen}`)
  console.log(`深度 ${result.depth ?? '无'} | 最佳着法 ${moveText(result.bestMove)} | 应手 ${moveText(result.ponder)}`)
  for (const variation of result.variations) {
    console.log(`  #${variation.multipv} 深度 ${variation.depth} / ${variation.timeMs ?? '未知'} ms | 原始 ${scoreText(variation.score.raw)} | 红方视角 ${scoreText(variation.score.red)}`)
    console.log('    ' + variation.pv.map(moveText).join(' '))
  }
  for (const warning of result.warnings) console.log(`  ${warning}`)
  if (result.kind === 'terminal') console.log(`终局 ${result.status.kind} | 胜方 ${result.status.winner}`)
  else assert.ok(result.bestMove && result.variations.length > 0, label + ' 缺少已验证的着法和候选')
  return result
}

try {
  await analyze('A 标准开局 / 单候选', { initialFen: standard })
  const multi = await analyze('B 标准开局 / MultiPV=3', { initialFen: standard, multiPv: 3 })
  assert.equal(multi.kind, 'analysis')
  assert.equal(multi.variations.length, 3)
  const mate = await analyze('C 演示残局 / 一步获胜', { initialFen: demo })
  assert.deepEqual(
    { kind: mate.variations[0].score.raw.kind, value: mate.variations[0].score.raw.value },
    { kind: 'mate', value: 1 },
  )
  const black = await analyze('D 黑方行棋 / 评分视角', {
    initialFen: standard, moves: [{ from: 'b2', to: 'e2' }], limit: { kind: 'time', ms: 100 },
  })
  const { raw, red } = black.variations[0].score
  assert.equal(black.sideToMove, 'black')
  assert.equal(red.kind, raw.kind)
  assert.equal(red.value, raw.value === 0 ? 0 : -raw.value)
  await analyze('E 从起始 FEN 重放六着', {
    initialFen: standard,
    limit: { kind: 'nodes', nodes: 50_000 },
    moves: [
      { from: 'b2', to: 'e2' }, { from: 'b9', to: 'c7' },
      { from: 'b0', to: 'c2' }, { from: 'c6', to: 'c5' },
      { from: 'a0', to: 'b0' }, { from: 'a9', to: 'b9' },
    ],
  })
  const terminal = await analyze('F 将死后的终局', { initialFen: demo, moves: [{ from: 'b7', to: 'b9' }] })
  assert.equal(terminal.kind, 'terminal')
  assert.deepEqual(terminal.status, { kind: 'checkmate', winner: 'red' })
  assert.equal(terminal.bestMove, null)
  assert.equal(terminal.variations.length, 0)
  console.log('\n六个场景验证通过。')
} finally {
  await engine.close()
}

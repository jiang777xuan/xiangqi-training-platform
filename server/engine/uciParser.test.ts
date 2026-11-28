import { expect, it } from 'vitest'
import { parseUciLine, withScorePerspective } from './uciParser.ts'
import type { ScoreBound } from './types.ts'

it.each(['uciok', 'readyok'])('解析握手回执 %s', (kind) => {
  expect(parseUciLine(kind)).toEqual({ kind })
})

it('解析最佳着法和应手', () => {
  expect(parseUciLine('bestmove b2e2 ponder b9c7')).toEqual({
    kind: 'bestmove', move: { from: 'b2', to: 'e2' }, ponder: { from: 'b9', to: 'c7' },
  })
})

it.each(['(none)', '0000'])('识别无着法标记 %s', (marker) => {
  expect(parseUciLine(`bestmove ${marker}`)).toEqual({ kind: 'bestmove', move: null, ponder: null })
})

it.each([
  ['cp', 31], ['cp', -32], ['mate', 1], ['mate', -3],
] as const)('保留 %s %s 的评分类型和正负号', (kind, value) => {
  expect(parseUciLine(`info depth 10 score ${kind} ${value} pv b2e2`))
    .toMatchObject({ score: { kind, value, bound: 'exact' } })
})

it('解析 MultiPV、各项搜索指标和完整坐标变化', () => {
  expect(parseUciLine('info depth 10 seldepth 13 multipv 3 score cp -16 upperbound nodes 3200 nps 800000 hashfull 8 time 4 pv h2e2 h9g7')).toEqual({
    kind: 'info', depth: 10, seldepth: 13, multipv: 3,
    score: { kind: 'cp', value: -16, bound: 'upperbound' }, nodes: 3200, nps: 800000, timeMs: 4,
    pv: [{ from: 'h2', to: 'e2' }, { from: 'h9', to: 'g7' }],
  })
})

it.each([
  ['lowerbound', 'upperbound'],
  ['upperbound', 'lowerbound'],
  ['exact', 'exact'],
] as const)('黑方评分反号且边界从 %s 转为 %s', (bound, redBound) => {
  const raw = { kind: 'mate', value: -2, bound } as const
  expect(withScorePerspective(raw, 'black')).toEqual({ sideToMove: 'black', raw, red: { kind: 'mate', value: 2, bound: redBound } })
})

it('红方评分保持原样，黑方零分仍是零', () => {
  const cp = { kind: 'cp', value: 25, bound: 'lowerbound' } as const
  expect(withScorePerspective(cp, 'red')).toEqual({ sideToMove: 'red', raw: cp, red: cp })
  expect(withScorePerspective({ kind: 'cp', value: 0, bound: 'exact' }, 'black').red.value).toBe(0)
})

it.each(['lowerbound', 'upperbound'] as const)('解析评分边界 %s', (bound: ScoreBound) => {
  expect(parseUciLine(`info depth 10 score cp 8 ${bound} pv b2e2`)).toMatchObject({ score: { bound } })
})

it.each([
  'info string depth 10 score cp 30 pv b2e2',
  'info depth 10 score cp NaN pv b2e2',
  'info depth -4 score cp 6 pv b2e2',
  'info depth 10 score mate 1 pv b2e2 j0c2',
  'info depth 10 score cp 6',
  'unknown chatter',
])('忽略无效或非分析输出 %s', (line) => {
  expect(parseUciLine(line)).toBeNull()
})

it('区别无着法和格式无效的 bestmove', () => {
  expect(parseUciLine('bestmove j2e2')).toEqual({ kind: 'invalid-bestmove' })
  expect(parseUciLine('bestmove b2e2 ponder')).toEqual({ kind: 'invalid-bestmove' })
})

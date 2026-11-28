import { expect, test } from 'vitest'
import { createGameFromFen, createStandardGame, type XiangqiGame, type XiangqiMove } from './index'
import { loadGameArchive, serializeGameArchive } from './archive'

const horseCycle = [
  { from: 'b0', to: 'c2' }, { from: 'b9', to: 'c7' },
  { from: 'c2', to: 'b0' }, { from: 'c7', to: 'b9' },
] as const

function play(game: XiangqiGame, moves: readonly XiangqiMove[]) {
  for (const move of moves) expect(game.tryMove(move)).toBe(true)
}

test('初始局面计为一次，棋盘和行棋方相同时忽略 FEN 中的走棋计数', () => {
  const game = createStandardGame()
  const initial = game.toFen()
  expect(game.getRepetitionCount()).toBe(1)

  play(game, horseCycle)
  const fen = game.toFen()
  expect(fen.split(' ').slice(0, 2)).toEqual(initial.split(' ').slice(0, 2))
  expect(fen.split(' ').slice(4)).not.toEqual(initial.split(' ').slice(4))
  expect(game.getRepetitionCount()).toBe(2)
})

test('五着后棋盘相同但换了行棋方，仍为新局面', () => {
  const game = createGameFromFen('4k3r/9/9/9/9/9/9/9/9/R2K5 w - - 0 1')
  const board = game.getBoard()
  play(game, [
    { from: 'a0', to: 'a1' }, { from: 'i9', to: 'i8' }, { from: 'a1', to: 'a2' },
    { from: 'i8', to: 'i9' }, { from: 'a2', to: 'a0' },
  ])

  expect(game.getBoard()).toEqual(board)
  expect(game.getTurn()).toBe('black')
  expect(game.getRepetitionCount()).toBe(1)
})

test('第三次和第四次重复正常计数，原有对弈状态继续有效', () => {
  const game = createStandardGame()
  play(game, [...horseCycle, ...horseCycle])
  expect(game.getRepetitionCount()).toBe(3)
  expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
  play(game, horseCycle)
  expect(game.getRepetitionCount()).toBe(4)
  expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
})

test('连续悔棋移除未来局面，重新走过的着法只计一次', () => {
  const game = createStandardGame()
  play(game, [...horseCycle, ...horseCycle])
  expect(game.getRepetitionCount()).toBe(3)
  expect(game.undoMove()).toBe(true)
  expect(game.getRepetitionCount()).toBe(2)
  for (let index = 0; index < 3; index++) expect(game.undoMove()).toBe(true)

  expect(game.getMoveHistory()).toHaveLength(4)
  expect(game.getRepetitionCount()).toBe(2)
  expect(() => game.getRepetitionCount(5)).toThrow(RangeError)
  play(game, horseCycle)
  expect(game.getRepetitionCount()).toBe(3)
})

test('非法着法保留计数，吃子后的新局面计一次，撤销吃子恢复旧次数', () => {
  const game = createStandardGame()
  play(game, [...horseCycle, ...horseCycle])
  expect(game.tryMove({ from: 'b9', to: 'c7' })).toBe(false)
  expect(game.getRepetitionCount()).toBe(3)

  expect(game.tryMove({ from: 'b2', to: 'b9' })).toBe(true)
  expect(game.getMoveHistory().at(-1)?.capture).toBe(true)
  expect(game.getRepetitionCount()).toBe(1)
  expect(game.undoMove()).toBe(true)
  expect(game.getRepetitionCount()).toBe(3)
})

test('FEN 加载失败保留历史，重新加载同一 FEN 则开启一段新历史', () => {
  const game = createStandardGame()
  play(game, [...horseCycle, ...horseCycle])
  const fen = game.toFen()
  expect(() => game.loadFen('9/9 w - - 0 1')).toThrow()
  expect(game.getRepetitionCount()).toBe(3)

  game.loadFen(fen)
  expect(game.toFen()).toBe(fen)
  expect(game.getRepetitionCount()).toBe(1)
  expect(game.undoMove()).toBe(false)
})

test('JSON 导入按着法重建重复记录，查询每个历史步数时只统计该步之前和该步', () => {
  const game = createStandardGame()
  const initial = game.toFen()
  play(game, [...horseCycle, ...horseCycle, ...horseCycle])
  const { game: loaded } = loadGameArchive(serializeGameArchive(initial, game.getMoveHistory()))

  expect(loaded.toFen()).toBe(game.toFen())
  expect([0, 4, 8, 12].map((step) => loaded.getRepetitionCount(step))).toEqual([1, 2, 3, 4])
  expect(loaded.getRepetitionCount()).toBe(4)
  expect(loaded.undoMove()).toBe(true)
  expect(loaded.getRepetitionCount()).toBe(3)
})

test('被将局面也可重复计数，仍能通过合法着法应将', () => {
  const game = createGameFromFen('4k4/9/4R4/9/9/9/9/9/9/3K5 b - - 0 1')
  const checkCycle = [
    { from: 'e9', to: 'f9' }, { from: 'e7', to: 'f7' },
    { from: 'f9', to: 'e9' }, { from: 'f7', to: 'e7' },
  ] as const
  play(game, [...checkCycle, ...checkCycle])
  expect(game.getStatus()).toEqual({ kind: 'check', winner: null })
  expect(game.getRepetitionCount()).toBe(3)
  expect(game.tryMove(checkCycle[0])).toBe(true)
  expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
})

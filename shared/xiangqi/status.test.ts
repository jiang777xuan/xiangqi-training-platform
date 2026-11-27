import { describe, expect, test } from 'vitest'
import { createGameFromFen } from './index'

const normalFen = '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
const blackCheckmatedFen = '1R2k4/R8/9/9/9/9/9/9/9/3K5 b - - 1 1'
const blackStalematedFen = '4k4/R8/5R3/9/9/9/9/9/9/3K5 b - - 1 1'

function loadPosition(fen: string) {
  // 创建棋局时先执行规则库的 FEN 校验。
  const game = createGameFromFen(fen)
  expect(game.toFen()).toBe(fen)
  return game
}

describe('局面状态', () => {
  test('当前一方未被将且有合法着法，局面正常', () => {
    const game = loadPosition(normalFen)

    expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
    expect(game.getLegalMoves('b7')).toContainEqual({ from: 'b7', to: 'b9' })
  })

  test('红帅被将且自身无路可走，红马仍能应将', () => {
    const game = loadPosition('3k5/9/9/9/9/9/9/2N6/r8/1r2K4 w - - 0 1')
    const capture = { from: 'c2', to: 'b0' } as const

    expect(game.getStatus()).toEqual({ kind: 'check', winner: null })
    expect(game.getLegalMoves('e0')).toEqual([])
    expect(game.getLegalMoves(capture.from)).toContainEqual(capture)
    expect(game.tryMove(capture)).toBe(true)
    expect(game.toFen()).toBe('3k5/9/9/9/9/9/9/9/r8/1N2K4 b - - 0 1')
    expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
  })

  test.each([
    {
      name: '红方被将且无棋可走，红方将死，黑方胜',
      fen: '3k5/9/9/9/9/9/9/9/r8/1r2K4 w - - 0 1',
      turn: 'red',
      status: { kind: 'checkmate', winner: 'black' },
      move: { from: 'e0', to: 'e1' },
    },
    {
      name: '黑方被将且无棋可走，黑方将死，红方胜',
      fen: blackCheckmatedFen,
      turn: 'black',
      status: { kind: 'checkmate', winner: 'red' },
      move: { from: 'e9', to: 'e8' },
    },
    {
      name: '红方未被将但无棋可走，红方困毙，黑方胜',
      fen: '3k5/9/9/9/9/9/9/5r3/r8/4K4 w - - 0 1',
      turn: 'red',
      status: { kind: 'stalemate', winner: 'black' },
      move: { from: 'e0', to: 'e1' },
    },
    {
      name: '黑方未被将但无棋可走，黑方困毙，红方胜',
      fen: blackStalematedFen,
      turn: 'black',
      status: { kind: 'stalemate', winner: 'red' },
      move: { from: 'e9', to: 'e8' },
    },
  ] as const)('$name，拒绝继续走棋', ({ fen, turn, status, move }) => {
    const game = loadPosition(fen)
    const board = game.getBoard()

    expect(game.getTurn()).toBe(turn)
    expect(game.getStatus()).toEqual(status)
    expect(game.getLegalMoves(move.from)).toEqual([])
    expect(game.tryMove(move)).toBe(false)
    expect(game.getBoard()).toEqual(board)
    expect(game.getTurn()).toBe(turn)
    expect(game.toFen()).toBe(fen)
    expect(game.getStatus()).toEqual(status)
  })

  test.each([
    {
      name: '将死',
      move: { from: 'b7', to: 'b9' },
      fen: blackCheckmatedFen,
      status: { kind: 'checkmate', winner: 'red' },
    },
    {
      name: '困毙',
      move: { from: 'b7', to: 'f7' },
      fen: blackStalematedFen,
      status: { kind: 'stalemate', winner: 'red' },
    },
  ] as const)('红车走成 $name 后立即终局', ({ move, fen, status }) => {
    const game = loadPosition(normalFen)

    expect(game.tryMove(move)).toBe(true)
    expect(game.getStatus()).toEqual(status)
    expect(game.toFen()).toBe(fen)
    expect(game.getLegalMoves('e9')).toEqual([])
    expect(game.tryMove({ from: 'e9', to: 'e8' })).toBe(false)
    expect(game.getTurn()).toBe('black')
    expect(game.toFen()).toBe(fen)
  })
})

describe('将帅照面', () => {
  test('将帅同列且中间无挡子时，拒绝加载 FEN', () => {
    expect(() => createGameFromFen('3k5/9/9/9/9/9/9/9/9/3K5 w - - 0 1'))
      .toThrow(/kings are facing each other/i)
  })

  test('有挡子时局面正常，移开唯一挡子的着法会被拒绝', () => {
    const fen = '3k5/9/9/9/3P5/9/9/9/9/3K5 w - - 0 1'
    const game = loadPosition(fen)
    const move = { from: 'd5', to: 'e5' } as const

    expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
    expect(game.getLegalMoves(move.from)).not.toContainEqual(move)
    expect(game.tryMove(move)).toBe(false)
    expect(game.toFen()).toBe(fen)
    expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
  })
})

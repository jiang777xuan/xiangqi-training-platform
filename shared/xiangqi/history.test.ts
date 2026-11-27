import { describe, expect, test } from 'vitest'
import { createGameFromFen, createStandardGame, type XiangqiGame } from './index'

function snapshot(game: XiangqiGame) {
  return {
    board: game.getBoard(),
    turn: game.getTurn(),
    fen: game.toFen(),
    status: game.getStatus(),
  }
}

describe('悔棋', () => {
  test('普通走棋后撤销一步，恢复棋盘、行棋方、FEN 和状态', () => {
    const game = createStandardGame()
    const initial = snapshot(game)

    expect(game.tryMove({ from: 'b0', to: 'c2' })).toBe(true)
    expect(game.getBoard()[9][1]).toBeNull()
    expect(game.getBoard()[7][2]).toEqual({ side: 'red', type: 'horse' })
    expect(game.getTurn()).toBe('black')

    expect(game.undoMove()).toBe(true)
    expect(snapshot(game)).toEqual(initial)
  })

  test('吃子解将后悔棋，恢复被吃的黑车、计数和被将状态', () => {
    const game = createGameFromFen('3k5/9/9/9/9/9/9/2N6/r8/1r2K4 w - - 7 4')
    const initial = snapshot(game)

    expect(initial.board[9][1]).toEqual({ side: 'black', type: 'rook' })
    expect(initial.status).toEqual({ kind: 'check', winner: null })
    expect(game.tryMove({ from: 'c2', to: 'b0' })).toBe(true)
    expect(game.getBoard()[7][2]).toBeNull()
    expect(game.getBoard()[9][1]).toEqual({ side: 'red', type: 'horse' })
    expect(game.toFen()).toBe('3k5/9/9/9/9/9/9/9/r8/1N2K4 b - - 0 4')
    expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })

    expect(game.undoMove()).toBe(true)
    expect(snapshot(game)).toEqual(initial)
  })

  test('连续悔两步，按走棋的逆序逐步恢复', () => {
    const game = createStandardGame()
    const initial = snapshot(game)

    expect(game.tryMove({ from: 'b0', to: 'c2' })).toBe(true)
    const afterRedMove = snapshot(game)
    expect(game.tryMove({ from: 'b9', to: 'c7' })).toBe(true)
    expect(game.getTurn()).toBe('red')

    expect(game.undoMove()).toBe(true)
    expect(snapshot(game)).toEqual(afterRedMove)
    expect(game.undoMove()).toBe(true)
    expect(snapshot(game)).toEqual(initial)
    expect(game.undoMove()).toBe(false)
  })

  test('开局时没有走棋记录，悔棋返回 false 并保留局面', () => {
    const game = createStandardGame()
    const initial = snapshot(game)

    expect(game.undoMove()).toBe(false)
    expect(snapshot(game)).toEqual(initial)
  })

  test('非法走棋不会新增历史，也不会占用已有合法着法的悔棋顺序', () => {
    const game = createStandardGame()
    const initial = snapshot(game)

    expect(game.tryMove({ from: 'b0', to: 'b1' })).toBe(false)
    expect(game.undoMove()).toBe(false)
    expect(snapshot(game)).toEqual(initial)

    expect(game.tryMove({ from: 'b0', to: 'c2' })).toBe(true)
    const afterRedMove = snapshot(game)
    expect(game.tryMove({ from: 'b9', to: 'b8' })).toBe(false)
    expect(snapshot(game)).toEqual(afterRedMove)
    expect(game.undoMove()).toBe(true)
    expect(snapshot(game)).toEqual(initial)
    expect(game.undoMove()).toBe(false)
  })

  test.each([
    {
      name: '将军',
      fen: '4k4/9/1R7/9/9/9/9/9/9/3K5 w - - 0 1',
      move: { from: 'b7', to: 'b9' },
      status: { kind: 'check', winner: null },
    },
    {
      name: '将死',
      fen: '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1',
      move: { from: 'b7', to: 'b9' },
      status: { kind: 'checkmate', winner: 'red' },
    },
    {
      name: '困毙',
      fen: '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1',
      move: { from: 'b7', to: 'f7' },
      status: { kind: 'stalemate', winner: 'red' },
    },
  ] as const)('造成 $name 后可悔棋，恢复正常对弈', ({ fen, move, status }) => {
    const game = createGameFromFen(fen)
    const initial = snapshot(game)
    expect(initial.status).toEqual({ kind: 'normal', winner: null })

    expect(game.tryMove(move)).toBe(true)
    expect(game.getStatus()).toEqual(status)
    expect(game.undoMove()).toBe(true)
    expect(snapshot(game)).toEqual(initial)

    expect(game.tryMove({ from: 'b7', to: 'c7' })).toBe(true)
    expect(game.getTurn()).toBe('black')
    expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
  })
})

test('非法走棋和导入失败保留棋谱，成功加载新局才清空记录', () => {
  const game = createStandardGame()
  const opening = game.toFen()
  expect(game.tryMove({ from: 'b0', to: 'c2' })).toBe(true)
  const played = game.getMoveHistory()
  expect(played).toHaveLength(1)
  expect(played[0]).toMatchObject({ round: 1, side: 'red', notation: '马八进七' })

  expect(game.tryMove({ from: 'b9', to: 'b8' })).toBe(false)
  expect(() => game.loadFen('9/9 w - - 0 1')).toThrow(/Invalid FEN/)
  expect(game.getMoveHistory()).toEqual(played)

  game.loadFen(opening)
  expect(game.getMoveHistory()).toEqual([])
  expect(game.undoMove()).toBe(false)
  expect(played).toHaveLength(1)
})

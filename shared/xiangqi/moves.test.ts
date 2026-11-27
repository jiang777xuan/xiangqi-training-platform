import { describe, expect, test } from 'vitest'
import { createGameFromFen, type XiangqiBoard, type XiangqiPiece, type XiangqiSquare } from './index'

function pieceAt(board: XiangqiBoard, square: XiangqiSquare) {
  const row = 9 - Number(square[1])
  const column = square.charCodeAt(0) - 'a'.charCodeAt(0)
  return board[row][column]
}

function expectLegalMove(
  fen: string,
  from: XiangqiSquare,
  to: XiangqiSquare,
  captured: XiangqiPiece | null = null,
) {
  const game = createGameFromFen(fen)
  const board = game.getBoard()
  const turn = game.getTurn()
  const movingPiece = pieceAt(board, from)
  expect(movingPiece?.side).toBe(turn)
  expect(pieceAt(board, to)).toEqual(captured)

  const move = { from, to }
  expect(game.getLegalMoves(from)).toContainEqual(move)
  expect(game.toFen()).toBe(fen)
  expect(game.tryMove(move)).toBe(true)

  const updatedBoard = game.getBoard()
  expect(pieceAt(updatedBoard, from)).toBeNull()
  expect(pieceAt(updatedBoard, to)).toEqual(movingPiece)
  expect(game.getTurn()).toBe(turn === 'red' ? 'black' : 'red')
}

function expectIllegalMove(fen: string, from: XiangqiSquare, to: XiangqiSquare) {
  const game = createGameFromFen(fen)
  const board = game.getBoard()
  const turn = game.getTurn()
  expect(pieceAt(board, from)?.side).toBe(turn)

  const move = { from, to }
  expect(game.getLegalMoves(from)).not.toContainEqual(move)
  expect(game.toFen()).toBe(fen)
  expect(game.tryMove(move)).toBe(false)

  expect(game.getBoard()).toEqual(board)
  expect(game.getTurn()).toBe(turn)
  expect(game.toFen()).toBe(fen)
}

describe('车', () => {
  const pawnOnA3 = '3k5/9/9/9/9/9/P8/9/9/R3K4 w - - 0 1'

  test.each(['a2', 'd0'] as const)('直线畅通时可走到 %s', (to) => {
    expectLegalMove(pawnOnA3, 'a0', to)
  })

  test('不能越过 a3 的兵走到 a4', () => {
    expectIllegalMove(pawnOnA3, 'a0', 'a4')
  })

  test('不能斜走到 b1', () => {
    expectIllegalMove(pawnOnA3, 'a0', 'b1')
  })
})

describe('马', () => {
  const clearLeg = '3k5/9/9/9/9/9/9/9/9/1N2K4 w - - 0 1'
  const blockedLeg = '3k5/9/9/9/9/9/9/9/1C7/1N2K4 w - - 0 1'

  test('b1 马腿空着时可走日字到 c2', () => {
    expectLegalMove(clearLeg, 'b0', 'c2')
  })

  test('b1 的炮蹩住马腿，不能走到 c2', () => {
    expectIllegalMove(blockedLeg, 'b0', 'c2')
  })

  test('b1 被挡时仍可沿另一条马腿走到 d1', () => {
    expectLegalMove(blockedLeg, 'b0', 'd1')
  })

  test('不能直走到 b2', () => {
    expectIllegalMove(clearLeg, 'b0', 'b2')
  })
})

describe('象', () => {
  const clearEye = '3k5/9/9/9/9/9/9/9/9/2B1K4 w - - 0 1'
  const blockedEye = '3k5/9/9/9/9/9/9/9/3C5/2B1K4 w - - 0 1'
  const riverbank = '3k5/9/9/9/9/2B6/9/9/9/4K4 w - - 0 1'

  test('d1 象眼空着时可走田字到 e2', () => {
    expectLegalMove(clearEye, 'c0', 'e2')
  })

  test('不能只斜走一步到 d1', () => {
    expectIllegalMove(clearEye, 'c0', 'd1')
  })

  test('d1 的炮塞住象眼，不能走到 e2', () => {
    expectIllegalMove(blockedEye, 'c0', 'e2')
  })

  test('象在河沿可退回己方一侧的 e2', () => {
    expectLegalMove(riverbank, 'c4', 'e2')
  })

  test('即使 d5 象眼空着，也不能从 c4 过河到 e6', () => {
    expectIllegalMove(riverbank, 'c4', 'e6')
  })
})

describe('士', () => {
  const advisorOnF2 = '3k5/9/9/9/9/9/9/5A3/9/4K4 w - - 0 1'

  test('可在九宫内斜走一步到 e1', () => {
    expectLegalMove(advisorOnF2, 'f2', 'e1')
  })

  test('在九宫内也不能横走到 e2', () => {
    expectIllegalMove(advisorOnF2, 'f2', 'e2')
  })

  test('不能斜走出九宫到 g3', () => {
    expectIllegalMove(advisorOnF2, 'f2', 'g3')
  })
})

describe('将与帅', () => {
  const clearFile = '3k5/9/9/9/9/9/9/9/9/4K4 w - - 0 1'
  const screenedFile = '3k5/9/9/9/3P5/9/9/9/9/4K4 w - - 0 1'

  test('可在九宫内直走一步到 e1', () => {
    expectLegalMove(clearFile, 'e0', 'e1')
  })

  test('在九宫内也不能斜走到 f1', () => {
    expectIllegalMove(clearFile, 'e0', 'f1')
  })

  test('不能从 e2 直走出九宫到 e3', () => {
    expectIllegalMove('3k5/9/9/9/9/9/9/4K4/9/9 w - - 0 1', 'e2', 'e3')
  })

  test('中间无子时不能走到 d0 与黑将照面', () => {
    expectIllegalMove(clearFile, 'e0', 'd0')
  })

  test('d5 有兵隔开时可走到 d0', () => {
    expectLegalMove(screenedFile, 'e0', 'd0')
  })

  test('不能横移 d5 唯一的挡子使将帅照面', () => {
    expectIllegalMove('3k5/9/9/9/3P5/9/9/9/9/3K5 w - - 0 1', 'd5', 'e5')
  })
})

describe('炮', () => {
  const noScreen = '3k5/9/9/9/r8/9/9/9/9/C3K4 w - - 0 1'
  const oneScreen = '3k5/9/9/9/r8/9/P8/9/9/C3K4 w - - 0 1'
  const twoScreens = '3k5/9/9/9/r8/n8/P8/9/9/C3K4 w - - 0 1'

  test('不吃子时可沿畅通的直线走到 a4', () => {
    expectLegalMove(noScreen, 'a0', 'a4')
  })

  test('不吃子时不能斜走到 b1', () => {
    expectIllegalMove(noScreen, 'a0', 'b1')
  })

  test('不吃子时不能越过 a3 的炮架走到空位 a4', () => {
    expectIllegalMove(oneScreen, 'a0', 'a4')
  })

  test('没有炮架时不能吃掉 a5 的黑车', () => {
    expectIllegalMove(noScreen, 'a0', 'a5')
  })

  test('恰好隔一个炮架时可吃掉 a5 的黑车', () => {
    expectLegalMove(oneScreen, 'a0', 'a5', { side: 'black', type: 'rook' })
  })

  test('隔着两个棋子时不能吃掉 a5 的黑车', () => {
    expectIllegalMove(twoScreens, 'a0', 'a5')
  })
})

describe('兵与卒', () => {
  const beforeRiver = '3k5/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1'
  const afterRiver = '3k5/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1'
  const blackAfterRiver = '3k5/9/9/9/9/2p6/9/9/9/4K4 b - - 0 1'

  test('可从己方河沿 e4 向前一步过河到 e5', () => {
    expectLegalMove(beforeRiver, 'e4', 'e5')
  })

  test('到己方河沿尚未过河，不能横走到 d4', () => {
    expectIllegalMove(beforeRiver, 'e4', 'd4')
  })

  test('过河前不能后退到 e3', () => {
    expectIllegalMove(beforeRiver, 'e4', 'e3')
  })

  test.each(['d5', 'f5', 'e6'] as const)('过河后可横走或向前到 %s', (to) => {
    expectLegalMove(afterRiver, 'e5', to)
  })

  test('过河后不能后退到 e4', () => {
    expectIllegalMove(afterRiver, 'e5', 'e4')
  })

  test('过河后也不能斜走到 f6', () => {
    expectIllegalMove(afterRiver, 'e5', 'f6')
  })

  test('黑卒过河后可向红方前进一步到 c3', () => {
    expectLegalMove(blackAfterRiver, 'c4', 'c3')
  })

  test('黑卒过河后不能向黑方后退到 c5', () => {
    expectIllegalMove(blackAfterRiver, 'c4', 'c5')
  })
})

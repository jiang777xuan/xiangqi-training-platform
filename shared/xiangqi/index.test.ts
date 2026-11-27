import { describe, expect, test } from 'vitest'
import { createStandardGame, type XiangqiPieceType } from './index'

const pieceLetters: Record<XiangqiPieceType, string> = {
  king: 'k',
  advisor: 'a',
  elephant: 'b',
  horse: 'n',
  rook: 'r',
  cannon: 'c',
  pawn: 'p',
}

describe('标准开局', () => {
  test('正确读取 10 行 9 列棋盘上的完整开局布局', () => {
    const board = createStandardGame().getBoard()
    // 用大写表示红棋，小写表示黑棋，点表示空位，逐格比对布局。
    const rows = board.map((row) => row.map((piece) => {
      if (piece === null) return '.'

      const letter = pieceLetters[piece.type]
      return piece.side === 'red' ? letter.toUpperCase() : letter
    }).join(''))

    expect(rows).toEqual([
      'rnbakabnr',
      '.........',
      '.c.....c.',
      'p.p.p.p.p',
      '.........',
      '.........',
      'P.P.P.P.P',
      '.C.....C.',
      '.........',
      'RNBAKABNR',
    ])
  })

  test('棋盘共有 32 枚棋子', () => {
    const pieces = createStandardGame().getBoard().flat().filter((piece) => piece !== null)

    expect(pieces).toHaveLength(32)
  })

  test('红方先行', () => {
    expect(createStandardGame().getTurn()).toBe('red')
  })

  test('红方与黑方各有 16 枚棋子', () => {
    const squares = createStandardGame().getBoard().flat()

    expect(squares.filter((piece) => piece?.side === 'red')).toHaveLength(16)
    expect(squares.filter((piece) => piece?.side === 'black')).toHaveLength(16)
  })

  test('导出完整的标准开局 FEN', () => {
    expect(createStandardGame().toFen()).toBe(
      'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
    )
  })
})

import { describe, expect, test } from 'vitest'
import { createGameFromFen, createStandardGame } from './index'

const standardPlacement = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR'
const standardFen = `${standardPlacement} w - - 0 1`
const customFen = '1R2k4/9/9/9/9/9/9/9/9/3K5 b - - 12 8'

const moves = [
  {
    move: { from: 'b0', to: 'c2' },
    fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1CN4C1/9/R1BAKABNR b - - 1 1',
    turn: 'black',
  },
  {
    move: { from: 'b9', to: 'c7' },
    fen: 'r1bakabnr/9/1cn4c1/p1p1p1p1p/9/9/P1P1P1P1P/1CN4C1/9/R1BAKABNR w - - 2 2',
    turn: 'red',
  },
  {
    move: { from: 'a3', to: 'a4' },
    fen: 'r1bakabnr/9/1cn4c1/p1p1p1p1p/9/P8/2P1P1P1P/1CN4C1/9/R1BAKABNR b - - 0 2',
    turn: 'black',
  },
] as const

describe('FEN 导入导出', () => {
  test('标准开局 FEN 可导入并原样导出', () => {
    const game = createGameFromFen(standardFen)

    expect(game.getBoard()).toEqual(createStandardGame().getBoard())
    expect(game.getTurn()).toBe('red')
    expect(game.toFen()).toBe(standardFen)
  })

  test('自定义 FEN 恢复棋子、黑方行棋、将军状态及非零计数', () => {
    const game = createGameFromFen(customFen)

    expect(game.getBoard()[0][1]).toEqual({ side: 'red', type: 'rook' })
    expect(game.getBoard()[0][4]).toEqual({ side: 'black', type: 'king' })
    expect(game.getTurn()).toBe('black')
    expect(game.getStatus()).toEqual({ kind: 'check', winner: null })
    expect(game.toFen()).toBe(customFen)
  })

  test('多步走棋后 FEN 逐步更新棋盘、行棋方和两个计数', () => {
    const game = createStandardGame()

    for (const { move, fen, turn } of moves) {
      expect(game.tryMove(move)).toBe(true)
      expect(game.toFen()).toBe(fen)
      expect(game.getTurn()).toBe(turn)
    }
  })

  test('重新导入实走后的 FEN 恢复当前局面，并从空历史开始', () => {
    const game = createStandardGame()
    for (const { move } of moves) {
      expect(game.tryMove(move)).toBe(true)
    }

    const imported = createGameFromFen(game.toFen())
    expect(imported.toFen()).toBe(moves[2].fen)
    expect(imported.getBoard()).toEqual(game.getBoard())
    expect(imported.getTurn()).toBe(game.getTurn())
    expect(imported.getStatus()).toEqual(game.getStatus())
    expect(imported.undoMove()).toBe(false)
  })

  test('逐步悔棋时 FEN 精确回到各个历史局面', () => {
    const game = createStandardGame()
    for (const { move } of moves) {
      expect(game.tryMove(move)).toBe(true)
    }

    for (const fen of [moves[1].fen, moves[0].fen, standardFen]) {
      expect(game.undoMove()).toBe(true)
      expect(game.toFen()).toBe(fen)
    }
  })

  test('短格式补齐默认字段，并将马象的 H/E 写法统一为 N/B', () => {
    const game = createGameFromFen(
      'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR b',
    )

    expect(game.getBoard()).toEqual(createStandardGame().getBoard())
    expect(game.getTurn()).toBe('black')
    expect(game.toFen()).toBe(`${standardPlacement} b - - 0 1`)
  })

  test('可导入首尾带空格和换行的粘贴文本', () => {
    const game = createGameFromFen(` \t${customFen}\r\n`)

    expect(game.toFen()).toBe(customFen)
    expect(game.getTurn()).toBe('black')
  })

  test.each([
    { name: '不足十行的棋盘', fen: '9/9 w - - 0 1', reason: /Invalid FEN:.*10/ },
    { name: '无效的行棋方', fen: `${standardPlacement} x - - 0 1`, reason: /side-to-move/ },
    { name: '占位字段中的车王易位标志', fen: `${standardPlacement} w K - 0 1`, reason: /castling/ },
    { name: '棋盘中的空位数字 0', fen: `0${standardFen}`, reason: /digits 1 through 9/ },
    { name: '夹杂字母的半回合计数', fen: `${standardPlacement} w - - 3x 8`, reason: /half-move counter/ },
    { name: '小数回合号', fen: `${standardPlacement} w - - 3 4.5`, reason: /full-move number/ },
    { name: '无法精确表示的回合号', fen: `${standardPlacement} w - - 0 9007199254740993`, reason: /full-move number/ },
  ])('拒绝 $name 并报告原因', ({ fen, reason }) => {
    expect(() => createGameFromFen(fen)).toThrow(reason)
  })
})

describe('导入到现有棋局', () => {
  test('导入成功后切换到新局面，并可开始新的走棋历史', () => {
    const game = createStandardGame()
    expect(game.tryMove(moves[0].move)).toBe(true)

    game.loadFen(customFen)

    expect(game.toFen()).toBe(customFen)
    expect(game.getBoard()).toEqual(createGameFromFen(customFen).getBoard())
    expect(game.getTurn()).toBe('black')
    expect(game.getStatus()).toEqual({ kind: 'check', winner: null })
    expect(game.undoMove()).toBe(false)
    expect(game.tryMove({ from: 'e9', to: 'e8' })).toBe(true)
    expect(game.undoMove()).toBe(true)
    expect(game.toFen()).toBe(customFen)
  })

  test('导入失败报告错误，并保留棋盘、行棋方、状态、FEN 和原有走棋历史', () => {
    const game = createStandardGame()
    expect(game.tryMove(moves[0].move)).toBe(true)
    const board = game.getBoard()
    const turn = game.getTurn()
    const status = game.getStatus()

    expect(() => game.loadFen('3k5/9/9/9/9/9/9/9/9/3K5 w - - 0 1'))
      .toThrow(/kings are facing each other/i)

    expect(game.getBoard()).toEqual(board)
    expect(game.getTurn()).toBe(turn)
    expect(game.getStatus()).toEqual(status)
    expect(game.toFen()).toBe(moves[0].fen)
    expect(game.undoMove()).toBe(true)
    expect(game.toFen()).toBe(standardFen)
    expect(game.undoMove()).toBe(false)
  })
})

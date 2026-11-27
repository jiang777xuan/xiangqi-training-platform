// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as rules from '../shared/xiangqi'
import type { XiangqiBoard as BoardPosition, XiangqiSquare } from '../shared/xiangqi'
import { XiangqiBoard } from './XiangqiBoard'

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<XiangqiBoard />) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

function pieceAt(square: XiangqiSquare) {
  const piece = container.querySelector<HTMLButtonElement>(`.board-piece[data-square="${square}"]`)
  if (!piece) throw new Error(`No piece at ${square}`)
  return piece
}

function targetSquares() {
  return [...container.querySelectorAll<HTMLElement>('.board-target')].map((target) => target.dataset.square).sort()
}

function position() {
  return [...container.querySelectorAll<HTMLButtonElement>('.board-piece')].map((piece) => [
    piece.dataset.square,
    piece.textContent,
    piece.style.left,
    piece.style.top,
  ])
}

async function click(element: HTMLElement) {
  await act(async () => { element.click() })
}

async function playMove(from: XiangqiSquare, to: XiangqiSquare) {
  await click(pieceAt(from))
  const target = container.querySelector<HTMLButtonElement>(`button[data-square="${to}"]:enabled`)
  if (!target) throw new Error(`No enabled destination at ${to}`)
  await click(target)
}

async function showPosition(fen: string) {
  const game = rules.createGameFromFen(fen)
  const factory = vi.spyOn(rules, 'createStandardGame').mockReturnValue(game)
  try {
    await act(async () => { root.render(<XiangqiBoard key={fen} />) })
  } finally {
    factory.mockRestore()
  }
  return game
}

function boardStatus() {
  return container.querySelector<HTMLElement>('.board-status')!
}

function expectLastMove(from: XiangqiSquare, to: XiangqiSquare) {
  expect(container.querySelectorAll('.board-last-move')).toHaveLength(2)
  expect(container.querySelector('.board-last-move-from')?.getAttribute('data-square')).toBe(from)
  expect(container.querySelector('.board-last-move-to')?.getAttribute('data-square')).toBe(to)
}

test('标准开局在 9 列、10 行交点上显示红黑各 16 枚棋子', () => {
  expect(container.querySelectorAll('.board-file')).toHaveLength(9)
  expect(container.querySelectorAll('.board-rank')).toHaveLength(10)
  expect(container.querySelectorAll('.board-piece')).toHaveLength(32)
  expect(container.querySelectorAll('.board-piece-red')).toHaveLength(16)
  expect(container.querySelectorAll('.board-piece:not(.board-piece-red)')).toHaveLength(16)
  expect(container.querySelector('figcaption')?.textContent).toContain('红方行棋')
})

function expectBoardToMatch(board: BoardPosition) {
  const names = {
    rook: { red: '俥', black: '車' },
    horse: { red: '傌', black: '馬' },
    elephant: { red: '相', black: '象' },
    advisor: { red: '仕', black: '士' },
    king: { red: '帥', black: '將' },
    cannon: { red: '炮', black: '砲' },
    pawn: { red: '兵', black: '卒' },
  }

  for (const [rowIndex, row] of board.entries()) {
    for (const [fileIndex, piece] of row.entries()) {
      const square = `${'abcdefghi'[fileIndex]}${9 - rowIndex}`
      const button = container.querySelector<HTMLButtonElement>(`button[data-square="${square}"]`)
      if (piece === null) {
        expect(button).toBeNull()
        continue
      }

      expect(button).not.toBeNull()
      expect(button?.textContent).toBe(names[piece.type][piece.side])
      expect(button?.classList.contains('board-piece-red')).toBe(piece.side === 'red')
      expect(Number.parseFloat(button!.style.left)).toBeCloseTo(fileIndex * 12.5)
      expect(Number.parseFloat(button!.style.top)).toBeCloseTo((rowIndex / 9) * 100)
    }
  }
}

test('逐个交点核对棋子的名称、颜色和位置与规则引擎一致', () => {
  expectBoardToMatch(rules.createStandardGame().getBoard())
})

test('红方行棋时可点击红棋并获得选中状态', async () => {
  const horse = pieceAt('b0')
  expect(horse.getAttribute('aria-pressed')).toBe('false')

  await click(horse)

  expect(horse.getAttribute('aria-pressed')).toBe('true')
})

test('红方行棋时黑棋无法被选中', async () => {
  const blackHorse = pieceAt('b9')
  expect(blackHorse.disabled).toBe(true)

  await click(blackHorse)

  expect(container.querySelector('[aria-pressed="true"]')).toBeNull()
  expect(targetSquares()).toEqual([])
})

test('选中红马后只标出规则引擎给出的合法落点', async () => {
  const moves = rules.createStandardGame().getLegalMoves('b0')
  expect(targetSquares()).toEqual([])

  await click(pieceAt('b0'))

  expect(targetSquares()).toEqual(moves.map(({ to }) => to).sort())
  expect(targetSquares()).toEqual(['a2', 'c2'])
})

test('切换到红兵后移除红马提示，并显示红兵落点', async () => {
  await click(pieceAt('b0'))
  await click(pieceAt('a3'))

  expect(pieceAt('b0').getAttribute('aria-pressed')).toBe('false')
  expect(pieceAt('a3').getAttribute('aria-pressed')).toBe('true')
  expect(targetSquares()).toEqual(['a4'])
})

test('点击棋盘上的非法空位不改变棋子位置、行棋方和选中状态', async () => {
  const initial = position()
  await click(pieceAt('b0'))
  const grid = container.querySelector<HTMLElement>('.board-grid')!

  await click(grid)

  expect(position()).toEqual(initial)
  expect(container.querySelector('figcaption')?.textContent).toContain('红方行棋')
  expect(pieceAt('b0').getAttribute('aria-pressed')).toBe('true')
  expect(targetSquares()).toEqual(['a2', 'c2'])
})

test('可吃子的合法落点显示圆环，点击其他不可吃的黑棋保持原局面', async () => {
  const initial = position()
  await click(pieceAt('b2'))

  expect(container.querySelector('.board-target-capture[data-square="b9"]')).not.toBeNull()
  await click(pieceAt('i9'))

  expect(position()).toEqual(initial)
  expect(pieceAt('b2').getAttribute('aria-pressed')).toBe('true')
})

test('再次点击已选棋子取消选择及落点提示', async () => {
  await click(pieceAt('b0'))
  await click(pieceAt('b0'))

  expect(pieceAt('b0').getAttribute('aria-pressed')).toBe('false')
  expect(targetSquares()).toEqual([])
})

test('点击合法空位后棋子从起点移到落点', async () => {
  await playMove('b0', 'c2')

  expect(container.querySelector('.board-piece[data-square="b0"]')).toBeNull()
  expect(pieceAt('c2').textContent).toBe('傌')
})

test('交替实走后逐个交点与规则引擎的棋盘一致', async () => {
  const expected = rules.createStandardGame()
  for (const [from, to] of [['b0', 'c2'], ['b9', 'c7'], ['a3', 'a4']] as const) {
    expect(expected.tryMove({ from, to })).toBe(true)
    await playMove(from, to)
  }

  expectBoardToMatch(expected.getBoard())
})

test('红黑交替行棋，界面显示当前一方', async () => {
  expect(boardStatus().textContent).toBe('红方行棋')
  await playMove('b0', 'c2')
  expect(boardStatus().textContent).toBe('黑方行棋')
  await playMove('b9', 'c7')
  expect(boardStatus().textContent).toBe('红方行棋')
})

test('点击可吃的黑马后，红炮占据目标交点且棋子总数减少', async () => {
  expect(pieceAt('b9').textContent).toBe('馬')
  await click(pieceAt('b2'))
  expect(pieceAt('b9').disabled).toBe(false)
  expect(pieceAt('b9').getAttribute('aria-label')).toContain('吃子')

  await click(pieceAt('b9'))

  expect(pieceAt('b9').textContent).toBe('炮')
  expect(pieceAt('b9').classList.contains('board-piece-red')).toBe(true)
  expect(container.querySelector('.board-piece[data-square="b2"]')).toBeNull()
  expect(container.querySelectorAll('.board-piece')).toHaveLength(31)
  expect(container.querySelectorAll('.board-piece:not(.board-piece-red)')).toHaveLength(15)
})

test('实走后点击非法空位，保留棋局、行棋方和上一步高亮', async () => {
  await playMove('b0', 'c2')
  const before = position()
  await click(pieceAt('b9'))
  expect(container.querySelector('button[data-square="b8"]')).toBeNull()

  await click(container.querySelector<HTMLElement>('.board-grid')!)

  expect(position()).toEqual(before)
  expect(boardStatus().textContent).toBe('黑方行棋')
  expectLastMove('b0', 'c2')
  expect(pieceAt('b9').getAttribute('aria-pressed')).toBe('true')
})

test('成功走棋后清除选中状态和所有合法落点提示', async () => {
  await playMove('b0', 'c2')

  expect(container.querySelector('[aria-pressed="true"]')).toBeNull()
  expect(targetSquares()).toEqual([])
})

test('换方后可选黑棋，点击刚走的红棋无法切换选择', async () => {
  await playMove('b0', 'c2')
  await click(pieceAt('b9'))
  await click(pieceAt('c2'))

  expect(pieceAt('c2').disabled).toBe(true)
  expect(pieceAt('b9').getAttribute('aria-pressed')).toBe('true')
  expect(targetSquares()).toEqual(['a7', 'c7'])
})

test('实走将军后指出黑方被将，合法应将后清除提示', async () => {
  await showPosition('4k4/9/1R7/9/9/9/9/9/9/3K5 w - - 0 1')
  await playMove('b7', 'b9')

  expect(boardStatus().dataset.state).toBe('check')
  expect(boardStatus().textContent).toBe('黑方行棋 · 被将军，请应将')
  await playMove('e9', 'e8')
  expect(boardStatus().dataset.state).toBe('normal')
  expect(boardStatus().textContent).toBe('红方行棋')
})

const checkmate = {
  fen: '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1',
  from: 'b7',
  to: 'b9',
} as const

const stalemate = {
  fen: '3k5/9/9/9/9/9/9/6r2/r8/4K4 b - - 0 1',
  from: 'g2',
  to: 'f2',
} as const

test('黑方被将死后显示红方获胜', async () => {
  await showPosition(checkmate.fen)
  await playMove(checkmate.from, checkmate.to)

  expect(boardStatus().dataset.state).toBe('checkmate')
  expect(boardStatus().textContent).toBe('红方获胜 · 黑方被将死')
})

test('红方困毙后显示黑方获胜', async () => {
  await showPosition(stalemate.fen)
  await playMove(stalemate.from, stalemate.to)

  expect(boardStatus().dataset.state).toBe('stalemate')
  expect(boardStatus().textContent).toBe('黑方获胜 · 红方困毙')
})

test.each([
  { name: '将死', ...checkmate },
  { name: '困毙', ...stalemate },
])('$name 后禁用棋子和落点，点击无法继续走棋', async ({ fen, from, to }) => {
  const game = await showPosition(fen)
  await playMove(from, to)
  const finalFen = game.toFen()
  const finalBoard = position()

  for (const piece of container.querySelectorAll<HTMLButtonElement>('.board-piece')) {
    expect(piece.disabled).toBe(true)
    await click(piece)
  }
  expect(targetSquares()).toEqual([])
  expect(position()).toEqual(finalBoard)
  expect(game.toFen()).toBe(finalFen)
  expectLastMove(from, to)
})

test('高亮上一步的起点和终点，并在下一步更新', async () => {
  expect(container.querySelectorAll('.board-last-move')).toHaveLength(0)
  await playMove('b0', 'c2')
  expectLastMove('b0', 'c2')
  await playMove('b9', 'c7')
  expectLastMove('b9', 'c7')
})

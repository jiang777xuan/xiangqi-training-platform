// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createStandardGame, type XiangqiSquare } from '../shared/xiangqi'
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

test('标准开局在 9 列、10 行交点上显示红黑各 16 枚棋子', () => {
  expect(container.querySelectorAll('.board-file')).toHaveLength(9)
  expect(container.querySelectorAll('.board-rank')).toHaveLength(10)
  expect(container.querySelectorAll('.board-piece')).toHaveLength(32)
  expect(container.querySelectorAll('.board-piece-red')).toHaveLength(16)
  expect(container.querySelectorAll('.board-piece:not(.board-piece-red)')).toHaveLength(16)
  expect(container.querySelector('figcaption')?.textContent).toContain('红方行棋')
})

test('逐个交点核对棋子的名称、颜色和位置与规则引擎一致', () => {
  const names = {
    rook: { red: '俥', black: '車' },
    horse: { red: '傌', black: '馬' },
    elephant: { red: '相', black: '象' },
    advisor: { red: '仕', black: '士' },
    king: { red: '帥', black: '將' },
    cannon: { red: '炮', black: '砲' },
    pawn: { red: '兵', black: '卒' },
  }

  for (const [rowIndex, row] of createStandardGame().getBoard().entries()) {
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
  const moves = createStandardGame().getLegalMoves('b0')
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

test('可吃子的合法落点显示圆环，点击目标棋子保持原局面', async () => {
  const initial = position()
  await click(pieceAt('b2'))

  expect(container.querySelector('.board-target-capture[data-square="b9"]')).not.toBeNull()
  await click(pieceAt('b9'))

  expect(position()).toEqual(initial)
  expect(pieceAt('b2').getAttribute('aria-pressed')).toBe('true')
})

test('再次点击已选棋子取消选择及落点提示', async () => {
  await click(pieceAt('b0'))
  await click(pieceAt('b0'))

  expect(pieceAt('b0').getAttribute('aria-pressed')).toBe('false')
  expect(targetSquares()).toEqual([])
})

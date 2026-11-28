// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { endgamePuzzles } from '../shared/endgame/puzzles'
import { loadTrainingRecords } from '../shared/endgame/records'
import type { XiangqiSquare } from '../shared/xiangqi'
import { App } from './App'
import { pieceNames } from './boardLabels'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  window.history.replaceState(null, '', '#endgames')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(<App />))
}

function find<T extends HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

async function navigate(hash: string) {
  await act(async () => {
    window.history.pushState(null, '', hash)
    window.dispatchEvent(new Event('hashchange'))
  })
}

function button(label: string) {
  const element = [...container.querySelectorAll<HTMLButtonElement>('.endgame-actions button')].find(({ textContent }) => textContent === label)
  if (!element) throw new Error(`Missing button: ${label}`)
  return element
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

async function play(from: XiangqiSquare, to: XiangqiSquare, scope = '.endgame-page') {
  await click(find(`${scope} .board-piece[data-square="${from}"]`))
  await click(find(`${scope} button[data-square="${to}"]:enabled`))
}

function pieces() {
  return [...container.querySelectorAll<HTMLElement>('.endgame-page .board-piece')].map((piece) => [piece.dataset.square, piece.textContent])
}

test('首页保留五个入口，进入残局再返回时首页对局保持原样', async () => {
  window.history.replaceState(null, '', '#home')
  await render()
  expect([...container.querySelectorAll('.training-module h3')].map(({ textContent }) => textContent))
    .toEqual(['残局闯关', 'AI 对练', '开局布局', 'AI 象棋教练', '个人训练中心'])
  await play('b0', 'c2', '.hero')
  const link = find<HTMLAnchorElement>('.training-link')
  expect(link.textContent).toBe('残局闯关')
  await navigate(link.hash)
  expect(find('.endgame-page h1').textContent).toBe('残局闯关')
  expect(find<HTMLElement>('main:has(.hero)').hidden).toBe(true)
  expect(find('.endgame-category').textContent).toContain('演示题')
  await navigate(find<HTMLAnchorElement>('.nav-link').hash)
  expect(container.querySelector('.endgame-page')).toBeNull()
  expect(find('.hero .board-status').textContent).toContain('黑方行棋')
  expect(find('.hero [data-square="c2"].board-piece').textContent).toBe(pieceNames.red.horse)
})

test('合法但错误的着法保留训练棋盘，提示逐级展示，正确着法显示结果和解析', async () => {
  await render()
  const initial = pieces()
  expect(initial).toContainEqual(['b7', pieceNames.red.rook])
  expect(find('.endgame-page .board-status').textContent).toBe('红方行棋')
  expect(find<HTMLButtonElement>('.endgame-page .board-piece[data-square="e9"]').disabled).toBe(true)
  await play('b7', 'f7')
  expect(find('.endgame-feedback').textContent).toContain('这步走法合法，但不属于本题答案')
  expect(pieces()).toEqual(initial)
  for (const level of [1, 2, 3]) await click(button(`提示 ${level}/3`))
  expect(container.querySelectorAll('.endgame-hints li')).toHaveLength(3)
  expect(find('.endgame-hints').textContent).toContain('b7 → b9')
  expect(button('提示已全部展开').disabled).toBe(true)
  await play('b7', 'b9')
  expect(pieces()).toContainEqual(['b9', pieceNames.red.rook])
  expect(pieces()).not.toContainEqual(['b7', pieceNames.red.rook])
  expect(find('.endgame-feedback').textContent).toContain(endgamePuzzles[0].explanation)
  expect(find('.endgame-page .board-status').textContent).toBe('红方达成训练目标')
  expect(find<HTMLButtonElement>('.endgame-page .board-piece[data-square="b9"]').disabled).toBe(true)
})

test('重新开始清除本次进度，下一题切换到执黑局面', async () => {
  await render()
  const initial = pieces()
  await click(button('提示 1/3'))
  await play('b7', 'b9')
  await click(button('重新开始'))
  expect(pieces()).toEqual(initial)
  expect(find('.endgame-page .board-status').textContent).toBe('红方行棋')
  expect(find('.endgame-progress').textContent).toContain('本次尝试 0 着 · 使用提示 0 次')
  expect(container.querySelectorAll('.endgame-page .board-last-move, .endgame-hints')).toHaveLength(0)

  await click(button('下一题'))
  expect(find('#endgame-title').textContent).toBe('双车封路')
  expect(find('.endgame-page .board-status').textContent).toBe('黑方行棋')
  expect(button('下一题').disabled).toBe(true)
  await play('g2', 'f2')
  expect(find('.endgame-page .board-status').textContent).toBe('黑方达成训练目标')
  expect(loadTrainingRecords()).toContainEqual(expect.objectContaining({ puzzleId: endgamePuzzles[1].id, firstTryCorrect: true }))
})

test('按题目记录错误、提示、完成时间，刷新后展示已保存的训练记录', async () => {
  await render()
  await play('b7', 'f7')
  await click(button('提示 1/3'))
  expect(loadTrainingRecords()).toEqual([{
    puzzleId: endgamePuzzles[0].id,
    completed: false,
    firstTryCorrect: false,
    hintCount: 1,
    attempts: 1,
    incorrectAttempts: 1,
    completedAt: null,
  }])
  await play('b7', 'b9')
  const saved = loadTrainingRecords()
  expect(saved).toEqual([{
    puzzleId: endgamePuzzles[0].id,
    completed: true,
    firstTryCorrect: false,
    hintCount: 1,
    attempts: 2,
    incorrectAttempts: 1,
    completedAt: expect.any(String),
  }])
  expect(Number.isNaN(Date.parse(saved[0].completedAt ?? ''))).toBe(false)
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  expect(find('.endgame-details').textContent).toContain('本机已完成 · 累计尝试 2 着 · 累计提示 1 次')
  expect(loadTrainingRecords()).toEqual(saved)
})

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createStandardGame, type XiangqiSquare } from '../shared/xiangqi'
import { XiangqiBoard } from './XiangqiBoard'

const standardFen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'
const redEndgame = '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
const blackEndgame = '1R2k4/9/9/9/9/9/9/9/9/3K5 b - - 12 8'
const movedFen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1CN4C1/9/R1BAKABNR b - - 1 1'

let container: HTMLDivElement
let root: Root
let originalClipboard: PropertyDescriptor | undefined

function find<T extends HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector)
  if (!element) throw new Error(`No element matches ${selector}`)
  return element
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<XiangqiBoard />) })

  // jsdom supplies the dialog element, but its native modal methods are browser APIs.
  const modal = find<HTMLDialogElement>('dialog')
  modal.showModal = () => { modal.open = true }
  modal.close = () => { modal.open = false }
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.unstubAllGlobals()
})

function button(label: string): HTMLButtonElement {
  const element = [...container.querySelectorAll('button')].find((button) => button.textContent === label)
  if (!element) throw new Error(`No button named ${label}`)
  return element
}

function dialog() {
  return find<HTMLDialogElement>('dialog')
}

function exportField() {
  return find<HTMLTextAreaElement>('[aria-label="导出局面"] textarea')
}

function importField() {
  return find<HTMLTextAreaElement>('.fen-import textarea')
}

async function click(element: HTMLElement) {
  await act(async () => { element.click() })
}

async function press(label: string) {
  await click(button(label))
}

async function setImport(fen: string) {
  const input = importField()
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, fen)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function importFen(fen: string) {
  await press('局面 FEN')
  await setImport(fen)
  await press('导入局面')
}

async function play(from: XiangqiSquare, to: XiangqiSquare) {
  await click(find<HTMLButtonElement>(`.board-piece[data-square="${from}"]`))
  await click(find<HTMLButtonElement>(`button[data-square="${to}"]:enabled`))
}

function boardState() {
  return {
    fen: exportField().value,
    pieces: [...container.querySelectorAll<HTMLButtonElement>('.board-piece')].map((piece) => [piece.dataset.square, piece.textContent]),
    status: find('.board-status').textContent,
    history: find('.move-history tbody').textContent,
    selected: container.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.dataset.square,
    targets: [...container.querySelectorAll<HTMLElement>('.board-target')].map((target) => target.dataset.square),
    lastMove: [...container.querySelectorAll<HTMLElement>('.board-last-move')].map((mark) => mark.dataset.square),
    undoDisabled: button('悔棋').disabled,
  }
}

test('打开 FEN 对话框可读取并选择完整标准开局 FEN', async () => {
  const before = boardState()
  await press('局面 FEN')

  expect(dialog().open).toBe(true)
  expect(exportField().readOnly).toBe(true)
  expect(exportField().value).toBe(standardFen)
  expect(boardState()).toEqual(before)
})

test('走棋后导出新的位置、黑方行棋和更新后的计数', async () => {
  await play('b0', 'c2')
  await press('局面 FEN')

  expect(exportField().value).toBe(movedFen)
})

test('吃子后的导出精确匹配规则引擎', async () => {
  const expected = createStandardGame()
  expect(expected.tryMove({ from: 'b2', to: 'b9' })).toBe(true)
  await play('b2', 'b9')
  await press('局面 FEN')

  expect(exportField().value).toBe(expected.toFen())
  expect(boardState().pieces).toHaveLength(31)
})

test('悔棋后的导出恢复到这一步之前的完整 FEN', async () => {
  await play('b0', 'c2')
  await play('b9', 'c7')
  await press('悔棋')
  await press('局面 FEN')

  expect(exportField().value).toBe(movedFen)
})

test('一键复制当前完整 FEN 并显示成功提示，棋局保持原样', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  await play('b0', 'c2')
  const before = boardState()
  await press('局面 FEN')
  await press('复制 FEN')

  expect(writeText).toHaveBeenCalledExactlyOnceWith(movedFen)
  expect(find('.fen-message').textContent).toBe('已复制 FEN。')
  expect(boardState()).toEqual(before)
})

test.each(['权限被拒绝', '接口缺失'])('剪贴板%s时选中全部文字并提示手动复制', async (reason) => {
  const clipboard = reason === '权限被拒绝'
    ? { writeText: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')) }
    : undefined
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
  await press('局面 FEN')
  await press('复制 FEN')

  expect(find('.fen-message').textContent).toContain('长按复制')
  expect(document.activeElement).toBe(exportField())
  expect(exportField().selectionStart).toBe(0)
  expect(exportField().selectionEnd).toBe(standardFen.length)
})

test('粘贴合法残局后立即显示棋子、红方行棋和当前 FEN', async () => {
  await importFen(redEndgame)

  expect(dialog().open).toBe(false)
  expect(boardState().fen).toBe(redEndgame)
  expect(boardState().status).toBe('红方行棋')
  expect(boardState().pieces).toEqual([['e9', '將'], ['a8', '俥'], ['b7', '俥'], ['d0', '帥']])
})

test('标准开局示例可填入输入区，残局示例可导入为黑方行棋', async () => {
  await press('局面 FEN')
  await press('标准开局示例')
  expect(importField().value).toBe(standardFen)
  await press('残局示例（黑方应将）')
  expect(importField().value).toBe(blackEndgame)
  await press('导入局面')

  expect(boardState().fen).toBe(blackEndgame)
  expect(boardState().status).toBe('黑方行棋 · 被将军，请应将')
  expect(boardState().pieces).toHaveLength(3)
  expect(find<HTMLButtonElement>('.board-piece[data-square="e9"]').disabled).toBe(false)
})

test.each([
  { fen: '9/9 w - - 0 1', error: '棋盘应有 10 行' },
  { fen: standardFen.replace(' w ', ' x '), error: '行棋方应为 w（红方）或 b（黑方）' },
  { fen: '3k5/9/9/9/9/9/9/9/9/3K5 w - - 0 1', error: '将帅同列时中间需要有棋子隔开' },
])('非法 FEN 会保留弹窗并显示中文原因 $error', async ({ fen, error }) => {
  await importFen(fen)

  expect(dialog().open).toBe(true)
  expect(find('.fen-error').textContent).toContain(error)
  expect(importField().getAttribute('aria-invalid')).toBe('true')
  expect(exportField().value).toBe(standardFen)
})

test('已有着法时，导入失败保留棋盘、棋谱、悔棋记录和选择', async () => {
  await play('b0', 'c2')
  await click(find('.board-piece[data-square="b9"]'))
  const before = boardState()
  await importFen('9/9 w - - 0 1')

  expect(find('.fen-error').textContent).toContain('导入失败')
  expect(container.querySelector('.fen-confirmation')).toBeNull()
  await press('关闭')
  expect(boardState()).toEqual(before)
  await press('悔棋')
  expect(exportField().value).toBe(standardFen)
})

test('确认覆盖后清除旧棋谱、悔棋记录、选中状态和高亮', async () => {
  await play('b0', 'c2')
  await click(find('.board-piece[data-square="b9"]'))
  const before = boardState()
  await importFen(blackEndgame)

  expect(find('.fen-confirmation').textContent).toContain('清空已有棋谱及悔棋记录')
  expect(boardState()).toEqual(before)
  await press('确认覆盖')

  expect(dialog().open).toBe(false)
  expect(boardState()).toMatchObject({
    fen: blackEndgame, history: '', selected: undefined, targets: [], lastMove: [], undoDisabled: true,
  })
})

test.each([
  { name: '将死', fen: '1R2k4/R8/9/9/9/9/9/9/9/3K5 b - - 1 1', kind: 'checkmate', status: '红方获胜 · 黑方被将死' },
  { name: '困毙', fen: '3k5/9/9/9/9/9/9/5r3/r8/4K4 w - - 0 1', kind: 'stalemate', status: '黑方获胜 · 红方困毙' },
])('导入 $name 局面立即显示胜方并禁用棋子', async ({ fen, kind, status }) => {
  await importFen(fen)

  expect(find('.board-status').getAttribute('data-state')).toBe(kind)
  expect(boardState().status).toBe(status)
  expect(container.querySelector('.board-piece:enabled')).toBeNull()
})

test('重置当前局面恢复导入时的棋子、行棋方、计数及将军状态', async () => {
  await importFen(blackEndgame)
  await play('e9', 'e8')
  expect(boardState().fen).not.toBe(blackEndgame)
  expect(boardState().history).not.toBe('')

  await press('重置当前局面')

  expect(boardState()).toMatchObject({
    fen: blackEndgame, status: '黑方行棋 · 被将军，请应将', history: '', lastMove: [], undoDisabled: true,
  })
  expect(boardState().pieces).toEqual([['b9', '俥'], ['e9', '將'], ['d0', '帥']])
})

test('导入后重新开始恢复标准开局，之后重置也回到标准开局', async () => {
  await importFen(blackEndgame)
  await press('重新开始')

  expect(boardState()).toMatchObject({ fen: standardFen, status: '红方行棋', history: '', undoDisabled: true })
  expect(boardState().pieces).toHaveLength(32)
  await play('b0', 'c2')
  await press('重置当前局面')
  expect(exportField().value).toBe(standardFen)
})

test('取消覆盖保留原局面与悔棋历史，仍可编辑待导入文本', async () => {
  await play('b0', 'c2')
  const before = boardState()
  await importFen(redEndgame)
  await press('取消覆盖')

  expect(dialog().open).toBe(true)
  expect(importField().readOnly).toBe(false)
  expect(importField().value).toBe(redEndgame)
  expect(boardState()).toEqual(before)
  await press('关闭')
  await press('悔棋')
  expect(exportField().value).toBe(standardFen)
})

test('关闭待确认的导入弹窗后保留原局面，重新打开不会残留确认', async () => {
  await play('b0', 'c2')
  const before = boardState()
  await importFen(redEndgame)
  await press('关闭')
  await press('局面 FEN')

  expect(boardState()).toEqual(before)
  expect(importField().value).toBe('')
  expect(container.querySelector('.fen-confirmation')).toBeNull()
})

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createStandardGame, type XiangqiSquare } from '../shared/xiangqi'
import { loadGameArchive, maxArchiveSize } from '../shared/xiangqi/archive'
import { XiangqiBoard } from './XiangqiBoard'

const standard = createStandardGame().toFen()
const custom = '4k4/9/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
const capture = { from: 'b2', to: 'b9' } as const
const reply = { from: 'a9', to: 'b9' } as const
let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<XiangqiBoard />) })

  // jsdom supplies dialog elements, while Chrome exercises native modal behavior.
  for (const dialog of container.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true }
    dialog.close = () => { dialog.open = false }
  }
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function find<T extends HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

function button(label: string) {
  const element = [...container.querySelectorAll('button')].find((node) => (node.getAttribute('aria-label') ?? node.textContent) === label)
  if (!element) throw new Error(`Missing button: ${label}`)
  return element
}

async function click(element: HTMLElement) {
  await act(async () => { element.click() })
}

async function press(label: string) {
  await click(button(label))
}

async function play(from: XiangqiSquare, to: XiangqiSquare) {
  await click(find(`.board-piece[data-square="${from}"]`))
  await click(find(`button[data-square="${to}"]:enabled`))
}

function fen() {
  return find<HTMLTextAreaElement>('[aria-label="导出局面"] textarea').value
}

function records() {
  return [...container.querySelectorAll('.move-record')].map((move) => move.textContent)
}

function view() {
  return {
    fen: fen(),
    pieces: container.querySelectorAll('.board-piece').length,
    status: find('.board-status').textContent,
    replay: find('.replay-status').textContent,
    records: records(),
    marked: [...container.querySelectorAll<HTMLElement>('.board-last-move')].map((mark) => mark.dataset.square),
    undoDisabled: button('悔棋').disabled,
  }
}

function makeArchive(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 1, initialFen: standard, moves: [capture, reply], ...overrides })
}

async function pickFile(file: File) {
  const input = find<HTMLInputElement>('.archive-dialog input[type="file"]')
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}

async function chooseArchive(text = makeArchive()) {
  await press('导入棋谱')
  await pickFile(new File([text], 'test-game.json', { type: 'application/json' }))
}

async function downloadedArchive() {
  const create = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:https://test.local/record')
  const revoke = vi.fn()
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }))
  const links: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    links.push(this.download)
  })

  await press('导出棋谱')

  expect(links).toEqual(['xiangqi-game.json'])
  expect(create).toHaveBeenCalledTimes(1)
  const blob = create.mock.calls[0][0]
  expect(blob.type).toBe('application/json')
  return loadGameArchive(await blob.text())
}

test('回到起始局面恢复标准开局和红方行棋，清除上一步高亮', async () => {
  await play('b0', 'c2')
  await press('回到起始局面')

  expect(view()).toMatchObject({ fen: standard, status: '红方行棋', replay: '正在复盘0 / 1 着', marked: [] })
  expect(records()).toEqual(['马八进七'])
  expect(button('上一步').disabled).toBe(true)
})

test('上一步和下一步在相邻局面间移动，最后一步恢复对弈', async () => {
  await play('b0', 'c2')
  const first = view()
  await play('b9', 'c7')
  const latest = view()
  await press('上一步')
  expect(view()).toMatchObject({ fen: first.fen, marked: first.marked, replay: '正在复盘1 / 2 着' })
  await press('下一步')
  expect(view()).toEqual(latest)
})

test('点击任意着法跳到对应步数并高亮，返回最新后可以继续走棋', async () => {
  await play('b0', 'c2')
  const first = fen()
  await play('b9', 'c7')
  await click(find('.move-record[data-step="1"]'))

  expect(fen()).toBe(first)
  expect(find('.move-record[aria-current="step"]').getAttribute('data-step')).toBe('1')
  expect(find<HTMLInputElement>('input[type="range"]').value).toBe('1')
  await press('回到最新局面')
  await play('a3', 'a4')
  expect(records()).toEqual(['马八进七', '马２进３', '兵九进一'])
})

test('拖动复盘进度条切换查看步数并同步当前着法', async () => {
  await play('b0', 'c2')
  await play('b9', 'c7')
  const slider = find<HTMLInputElement>('input[type="range"]')
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(slider, '1')
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })

  expect(view().replay).toBe('正在复盘1 / 2 着')
  expect(slider.getAttribute('aria-valuetext')).toBe('第 1 着，共 2 着')
  expect(find('.move-record[aria-current="step"]').getAttribute('data-step')).toBe('1')
})

test('复盘吃子前后恢复被吃棋子、走子位置和行棋方', async () => {
  await play(capture.from, capture.to)
  const after = view()
  await press('回到起始局面')
  expect(find('.board-piece[data-square="b9"]').textContent).toBe('馬')
  expect(view().pieces).toBe(32)
  await press('下一步')
  expect(find('.board-piece[data-square="b9"]').textContent).toBe('炮')
  expect(view()).toEqual(after)
})

test('自定义 FEN 开局能回看起点以及将军前后的状态', async () => {
  await chooseArchive(makeArchive({ initialFen: custom, moves: [{ from: 'b7', to: 'b9' }, { from: 'e9', to: 'e8' }] }))
  await press('确认导入棋谱')
  await press('回到起始局面')
  expect(fen()).toBe(custom)
  await press('下一步')

  expect(view()).toMatchObject({ status: '黑方行棋 · 被将军，请应将', marked: ['b9', 'b7'] })
  await press('回到最新局面')
  expect(view().status).toBe('红方行棋')
})

test('复盘锁住走棋、悔棋、重开、重置和导入，返回最新后悔棋历史仍在', async () => {
  await play('b0', 'c2')
  const afterFirst = fen()
  await play('b9', 'c7')
  const latest = view()
  await press('回到起始局面')
  const before = view()

  expect(container.querySelector('.board-piece:enabled')).toBeNull()
  await click(find('.board-piece[data-square="b0"]'))
  for (const label of ['悔棋', '重新开始', '重置当前局面', '导入棋谱']) {
    expect(button(label).disabled).toBe(true)
    await press(label)
  }
  await press('局面 FEN')
  expect(container.querySelector('.fen-import')).toBeNull()
  expect(find('.fen-replay-note').textContent).toContain('复盘局面')
  expect(view()).toEqual(before)
  await click(find('.fen-dialog header button'))
  await press('回到最新局面')
  expect(view()).toEqual(latest)
  await press('悔棋')
  expect(fen()).toBe(afterFirst)
  expect(records()).toEqual(['马八进七'])
})

test('从下载按钮导出完整棋局，导出不改变棋盘', async () => {
  await play(capture.from, capture.to)
  await play(reply.from, reply.to)
  const before = view()
  const { archive, game } = await downloadedArchive()

  expect(archive).toMatchObject({ version: 1, initialFen: standard, moves: [capture, reply] })
  expect(game.toFen()).toBe(before.fen)
  expect(view()).toEqual(before)
})

test('查看历史时下载仍包含最新棋局的所有着法，保留复盘进度', async () => {
  await play(capture.from, capture.to)
  await play(reply.from, reply.to)
  const latestFen = fen()
  await press('回到起始局面')
  const before = view()
  const { archive, game } = await downloadedArchive()

  expect(archive.moves).toEqual([capture, reply])
  expect(game.toFen()).toBe(latestFen)
  expect(view()).toEqual(before)
})

test('确认文件后完整替换棋局并重建着法，导入后可逐着悔棋', async () => {
  await play('b0', 'c2')
  const before = view()
  await chooseArchive()
  expect(find('.archive-confirmation').textContent).toContain('已校验 2 着')
  expect(view()).toEqual(before)
  await press('确认导入棋谱')

  expect(find<HTMLDialogElement>('.archive-dialog').open).toBe(false)
  expect(view()).toMatchObject({ pieces: 30, records: ['炮八进七', '车１平２'], undoDisabled: false })
  await press('悔棋')
  expect(view()).toMatchObject({ pieces: 31, records: ['炮八进七'] })
  await press('悔棋')
  expect(view()).toMatchObject({ fen: standard, pieces: 32, records: [], undoDisabled: true })
})

test('非法着法出错时指出具体步数，原棋谱和悔棋记录保持不变', async () => {
  await play('b0', 'c2')
  const before = view()
  await chooseArchive(makeArchive({ moves: [capture, { from: 'b9', to: 'b8' }] }))

  expect(find('.archive-import-error').textContent).toContain('第 2 着非法（b9 → b8）')
  expect(button('确认导入棋谱').disabled).toBe(true)
  expect(view()).toEqual(before)
  await press('取消导入')
  await press('悔棋')
  expect(fen()).toBe(standard)
})

test('取消已经校验过的导入保留原局面，重新打开时清空候选文件', async () => {
  await play('b0', 'c2')
  const before = view()
  await chooseArchive()
  await press('取消导入')

  expect(view()).toEqual(before)
  expect(find<HTMLDialogElement>('.archive-dialog').open).toBe(false)
  await press('导入棋谱')
  expect(button('确认导入棋谱').disabled).toBe(true)
})

test('文件过大时不读取内容并报告上限', async () => {
  const largeFile = new File([new Uint8Array(maxArchiveSize + 1)], 'large.json')
  const read = vi.spyOn(largeFile, 'text')
  await press('导入棋谱')
  await pickFile(largeFile)

  expect(read).not.toHaveBeenCalled()
  expect(find('.archive-import-error').textContent).toContain('256 KiB')
  expect(button('确认导入棋谱').disabled).toBe(true)
})

test('取消读取中的导入后，迟到的读取结果无法替换新打开的弹窗', async () => {
  const file = new File([''], 'slow.json')
  let finish!: (text: string) => void
  vi.spyOn(file, 'text').mockReturnValue(new Promise((resolve) => { finish = resolve }))
  await press('导入棋谱')
  await pickFile(file)
  await press('取消导入')
  await press('导入棋谱')
  await act(async () => { finish(makeArchive()) })

  expect(button('确认导入棋谱').disabled).toBe(true)
  expect(fen()).toBe(standard)
})

test('重新打开后，上一轮延迟送达的关闭事件不会清空已校验的文件', async () => {
  await chooseArchive()
  await press('取消导入')
  await chooseArchive()
  const dialog = find<HTMLDialogElement>('.archive-dialog')
  await act(async () => { dialog.dispatchEvent(new Event('close')) })

  expect(button('确认导入棋谱').disabled).toBe(false)
  await press('确认导入棋谱')
  expect(view().pieces).toBe(30)
})

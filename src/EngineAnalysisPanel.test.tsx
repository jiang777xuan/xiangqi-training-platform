// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { EngineStatus, HttpAnalysisRequest, HttpAnalysisResult, UciScore } from '../shared/analysis/types'
import { createGameFromFen, createStandardGame, type XiangqiSquare } from '../shared/xiangqi'
import { App } from './App'
import { XiangqiBoard } from './XiangqiBoard'

const standard = createStandardGame().toFen()
const demo = '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
const online: EngineStatus = { configured: true, available: true, version: '2026-09-06', analyzing: false, error: null }
const score = (value: number, kind: UciScore['kind'] = 'cp', bound: UciScore['bound'] = 'exact'): UciScore => ({ value, kind, bound })
type Search = { body: HttpAnalysisRequest; signal?: AbortSignal | null; complete: (response: Response) => void }
let container: HTMLDivElement
let root: Root
let searches: Search[]
let cancellations: string[]
let status: EngineStatus | Error

function json(value: object, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  searches = []
  cancellations = []
  status = online
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit) => {
    if (path === '/api/engine/status') {
      if (status instanceof Error) throw status
      return json(status)
    }
    if (path === '/api/engine/cancel') {
      const { requestId } = JSON.parse(String(options.body)) as { requestId: string }
      cancellations.push(requestId)
      return json({ requestId, cancelled: true })
    }
    if (path === '/api/engine/analyze') {
      return new Promise<Response>((complete) => searches.push({ body: JSON.parse(String(options.body)), signal: options.signal, complete }))
    }
    throw new Error('Unexpected path ' + path)
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  window.history.replaceState(null, '', '#home')
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  window.history.replaceState(null, '', window.location.pathname)
  vi.unstubAllGlobals()
})

async function render(home = false) {
  await act(async () => { root.render(home ? <App /> : <XiangqiBoard />) })
  container.querySelectorAll('dialog').forEach((dialog) => {
    dialog.showModal = () => { dialog.open = true }
    dialog.close = () => { dialog.open = false }
  })
}

function find<T extends HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector)
  if (!element) throw new Error('Missing ' + selector)
  return element
}

function button(label: string) {
  const element = [...container.querySelectorAll('button')].find((item) => (item.getAttribute('aria-label') || item.textContent?.trim()) === label)
  if (!element) throw new Error('Missing button ' + label)
  return element
}

async function click(element: HTMLElement) {
  await act(async () => { element.click() })
}

const press = (label: string) => click(button(label))
const openPanel = () => click(find('.analysis-toggle'))
const analyze = () => press('分析当前局面')

async function play(from: XiangqiSquare, to: XiangqiSquare, scope = '.board-play') {
  await click(find(`${scope} .board-piece[data-square="${from}"]`))
  await click(find(`${scope} button[data-square="${to}"]:enabled`))
}

async function importFen(fen: string) {
  await press('局面 FEN')
  const textarea = find<HTMLTextAreaElement>('.fen-import textarea')
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(textarea, fen)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await press('导入局面')
}

const panel = () => find('.analysis-panel').textContent

function analysisFor({ body }: Search, options: Partial<HttpAnalysisResult> = {}): HttpAnalysisResult {
  const game = createGameFromFen(body.initialFen)
  for (const move of body.moves ?? []) expect(game.tryMove(move)).toBe(true)
  const fen = game.toFen()
  const sideToMove = game.getTurn()
  const pair = sideToMove === 'red' ? { from: 'b2', to: 'e2' } : { from: 'b9', to: 'c7' }
  const best = game.tryMove(pair as Parameters<typeof game.tryMove>[0]) ? game.getMoveHistory().at(-1)! : null
  const stats = { score: { sideToMove, raw: score(35), red: score(sideToMove === 'red' ? 35 : -35) },
    depth: 14, multipv: 1, nodes: 3200 }
  return {
    requestId: body.requestId, fen, kind: 'analysis', sideToMove, status: { kind: 'normal', winner: null },
    requestedMultiPv: body.multiPv ?? 1, expectedMultiPv: 1, depth: 14, elapsedMs: 12, bestMove: best,
    ponder: null, variations: best ? [{ ...stats, pv: [best] }] : [], warnings: [], ...options,
  }
}

async function finish(index = 0, result?: HttpAnalysisResult) {
  const search = searches[index]
  await act(async () => { search.complete(json(result ?? analysisFor(search))) })
}

it('默认折叠，连接成功后显示真实等待和结果，并能高亮或清除棋盘交点', async () => {
  await render()
  expect(fetch).not.toHaveBeenCalled()
  await openPanel()
  expect(panel()).toContain('Pikafish · 2026-09-06 · 已连接')
  await analyze()
  expect(panel()).toContain('引擎正在分析')
  expect(searches[0].body).toMatchObject({ initialFen: standard, moves: [], limit: { kind: 'time', ms: 1000 }, multiPv: 1 })
  await finish()
  expect(panel()).toContain('炮八平五')
  expect(panel()).toContain('cp +35（偏红）')
  expect(panel()).toContain('深度 14 · 耗时 12 ms · 3,200 节点')
  await press('在棋盘高亮')
  expect(container.querySelector('.board-analysis-from')?.getAttribute('data-square')).toBe('b2')
  expect(container.querySelector('.board-analysis-to')?.getAttribute('data-square')).toBe('e2')
  await press('清除分析高亮')
  expect(container.querySelector('.board-analysis-mark')).toBeNull()
  expect(find('.replay-status').textContent).toContain('0 / 0')
})

it('黑方原始正分转用红方负分显示；MultiPV 显示三个候选和各自深度', async () => {
  await render()
  await play('b2', 'e2')
  await openPanel()
  const select = [...container.querySelectorAll<HTMLSelectElement>('.analysis-options select')][1]
  await act(async () => { select.value = '3'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  await analyze()
  expect(searches[0].body.multiPv).toBe(3)
  const result = analysisFor(searches[0])
  const [line] = result.variations
  const follow = { ...line, depth: 12 }
  await finish(0, { ...result, variations: [line, { ...follow, multipv: 2 }, { ...follow, multipv: 3 }] })
  expect(panel()).toContain('马２进３')
  expect(panel()).toContain('cp -35（偏黑）')
  expect(container.querySelectorAll('.analysis-variations li')).toHaveLength(3)
  expect(find('.analysis-variations li:nth-child(2)').textContent).toContain('深度 12')
})

it('分别显示 mate、上下界、部分结果和裁决差异', async () => {
  await render()
  await openPanel()
  await analyze()
  const first = analysisFor(searches[0])
  const line = first.variations[0]
  await finish(0, {
    ...first, kind: 'partial', warnings: ['部分变化缺失'],
    variations: [
      { ...line, score: { ...line.score, red: score(1, 'mate', 'lowerbound') } },
      { ...line, multipv: 2, score: { ...line.score, red: score(-8, 'cp', 'upperbound') } },
    ],
  })
  expect(panel()).toContain('候选未完整返回')
  expect(panel()).toContain('下界 ≥ mate 1')
  expect(panel()).toContain('可能为将死或困毙')
  expect(panel()).toContain('上界 ≤ cp -8')
  await analyze()
  await finish(1, { ...analysisFor(searches[1]), kind: 'rule-disagreement', bestMove: null, depth: null, variations: [] })
  expect(panel()).toContain('引擎与项目规则的判定不同')
  expect(panel()).not.toContain('最佳着法')
})

it('走棋丢弃旧结果，只有新请求编号与局面都匹配时才显示', async () => {
  await render()
  await openPanel()
  await analyze()
  await play('b2', 'e2')
  expect(searches[0].signal?.aborted).toBe(true)
  expect(cancellations).toEqual([searches[0].body.requestId])
  await analyze()
  expect(searches[1].body.moves).toEqual([{ from: 'b2', to: 'e2' }])
  expect(searches[0].body.requestId).not.toBe(searches[1].body.requestId)
  await finish(0)
  expect(panel()).not.toContain('最佳着法')
  expect(panel()).toContain('正在分析')
  await finish(1, { ...analysisFor(searches[1]), fen: standard })
  expect(panel()).toContain('与当前局面不一致')
  expect(panel()).not.toContain('最佳着法')
})

it('悔棋在返回原局面时也会使搜索失效，已显示的高亮随局面清除', async () => {
  await render()
  await openPanel()
  await analyze()
  await finish()
  await press('在棋盘高亮')
  await play('b2', 'e2')
  expect(container.querySelector('.board-analysis-mark')).toBeNull()
  await analyze()
  await press('悔棋')
  expect(searches[1].signal?.aborted).toBe(true)
  await finish(1)
  expect(panel()).not.toContain('最佳着法')
  expect(panel()).toContain('第 0 着')
})

it('复盘只发送截至当前步数的历史，切步使在途请求失效', async () => {
  await render()
  await play('b2', 'e2')
  await play('b9', 'c7')
  await play('b0', 'c2')
  await click(find('.move-record[data-step="1"]'))
  await openPanel()
  expect(panel()).toContain('复盘 · 第 1 着')
  await analyze()
  expect(searches[0].body).toMatchObject({ initialFen: standard, moves: [{ from: 'b2', to: 'e2' }] })
  await press('下一步')
  expect(searches[0].signal?.aborted).toBe(true)
  await analyze()
  expect(searches[1].body.moves).toEqual([{ from: 'b2', to: 'e2' }, { from: 'b9', to: 'c7' }])
  await finish()
  expect(panel()).not.toContain('最佳着法')
})

it.each(['重新开始', '重置当前局面'])('即使 FEN 相同，%s 也取消在途分析', async (label) => {
  await render()
  await openPanel()
  await analyze()
  await press(label)
  expect(searches[0].signal?.aborted).toBe(true)
  await finish()
  expect(panel()).not.toContain('最佳着法')
})

it('导入 FEN 或 JSON 棋谱使分析失效并更新下一次请求的起点', async () => {
  await render()
  await openPanel()
  await analyze()
  await importFen(demo)
  expect(searches[0].signal?.aborted).toBe(true)
  await analyze()
  expect(searches[1].body.initialFen).toBe(demo)
  await press('导入棋谱')
  const input = find<HTMLInputElement>('.archive-dialog input[type=file]')
  const content = JSON.stringify({ version: 1, initialFen: standard, moves: [{ from: 'b2', to: 'e2' }] })
  Object.defineProperty(input, 'files', { value: [{ size: content.length, text: async () => content }] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  await press('确认导入棋谱')
  expect(searches[1].signal?.aborted).toBe(true)
  await analyze()
  expect(searches[2].body).toMatchObject({ initialFen: standard, moves: [{ from: 'b2', to: 'e2' }] })
})

it('停止分析按编号取消，随后可重新分析并忽略旧响应', async () => {
  await render()
  await openPanel()
  await analyze()
  await press('停止分析')
  expect(cancellations).toEqual([searches[0].body.requestId])
  expect(searches[0].signal?.aborted).toBe(true)
  expect(panel()).toContain('分析已停止')
  await analyze()
  await finish(0)
  expect(panel()).not.toContain('最佳着法')
  await finish(1)
  expect(panel()).toContain('最佳着法')
})

it('引擎忙碌状态提示后可重新提交', async () => {
  await render()
  await openPanel()
  await analyze()
  await act(async () => { searches[0].complete(json({ error: { code: 'busy', message: '引擎正在处理另一项任务。' } }, 409)) })
  expect(panel()).toContain('引擎正在处理另一项任务')
  expect(button('分析当前局面').disabled).toBe(false)
})

it('离开基础棋盘取消分析；后端离线时棋盘与残局仍可操作', async () => {
  await render(true)
  await openPanel()
  await analyze()
  const route = async (hash: string) => act(async () => {
    window.history.pushState(null, '', hash)
    window.dispatchEvent(new Event('hashchange'))
  })
  await route('#endgames')
  expect(searches[0].signal?.aborted).toBe(true)
  expect(find('.endgame-page').textContent).toContain('残局闯关')
  status = new Error('offline')
  await route('#home')
  expect(panel()).toContain('无法连接本地分析服务')
  expect(button('分析当前局面').disabled).toBe(true)
  await play('b2', 'e2')
  expect(find('.hero .board-status').textContent).toContain('黑方行棋')
  await route('#endgames')
  await play('b7', 'b9', '.endgame-page')
  expect(find('.endgame-feedback').textContent).toContain('训练完成')
})

import { expect, it } from 'vitest'
import { createStandardGame, type XiangqiMove } from '../../shared/xiangqi/index.ts'
import { preparePosition, verifyLine } from './position.ts'
import { goCommand, readPikafishConfig } from './config.ts'

const initialFen = createStandardGame().toFen()
const opening = [{ from: 'b2', to: 'e2' }, { from: 'b9', to: 'c7' }] as const

it('发送标准化的起始 FEN 和历史着法，保留独立棋局中的历史', () => {
  const position = preparePosition({ initialFen: `  ${initialFen}  `, moves: opening })
  expect(position.command).toBe(`position fen ${initialFen} moves b2e2 b9c7`)
  expect(position.fen).not.toBe(initialFen)
  expect(position.game.getMoveHistory()).toHaveLength(2)
})

it.each(['invalid FEN', `${initialFen}\ngo depth 60`, `${initialFen}\n`, `${initialFen}\rquit`])('拒绝无效或多行 FEN %s', (fen) => {
  expect(() => preparePosition({ initialFen: fen })).toThrow(/FEN/)
})

it('拒绝越界、带换行或缺项的历史坐标', () => {
  const moves = [
    [{ from: 'j0', to: 'e2' }],
    [{ from: 'b2', to: 'e2\n' }],
    Array(1),
  ]
  for (const list of moves) {
    expect(() => preparePosition({ initialFen, moves: list as XiangqiMove[] })).toThrow('第 1 着坐标无效')
  }
})

it('重放时拒绝合法格式的非法历史，并指出第几着', () => {
  expect(() => preparePosition({ initialFen, moves: [opening[0], { from: 'b0', to: 'c2' }] })).toThrow('第 2 着非法')
})

it('从当前局面校验整条 PV 并生成中文棋谱，成功或失败都恢复原历史', () => {
  const { game, fen } = preparePosition({ initialFen, moves: opening.slice(0, 1) })
  const before = game.getMoveHistory()
  expect(verifyLine(game, [opening[1], { from: 'b0', to: 'c2' }])).toMatchObject({
    records: [
      { from: 'b9', to: 'c7', side: 'black', notation: expect.any(String) },
      { from: 'b0', to: 'c2', side: 'red', notation: '马八进七' },
    ],
  })
  expect(verifyLine(game, [opening[1], opening[0]])).toEqual({ illegalAt: 2 })
  expect(game.toFen()).toBe(fen)
  expect(game.getMoveHistory()).toEqual(before)
})

it('使用默认配置，仅接受范围内的整数并生成固定形式的 go 命令', () => {
  expect(readPikafishConfig({})).toMatchObject({ threads: 4, hashMb: 128, multiPv: 1, moveTimeMs: 1000, hardTimeoutMs: 10_000 })
  expect(readPikafishConfig({ PIKAFISH_PATH: 'C:\\Program Files\\Pikafish.exe' }).path).toBe('C:\\Program Files\\Pikafish.exe')
  expect(() => readPikafishConfig({ PIKAFISH_THREADS: '33' })).toThrow('Threads')
  expect(() => readPikafishConfig({ PIKAFISH_MULTIPV: '1\nisready' })).toThrow('PIKAFISH_MULTIPV')
  expect(goCommand(undefined, 1000)).toBe('go movetime 1000')
  expect(goCommand({ kind: 'nodes', nodes: 5000 }, 1000)).toBe('go nodes 5000')
  expect(goCommand({ kind: 'time', ms: 10 }, 1000)).toBe('go movetime 10')
  expect(() => goCommand({ kind: 'depth', depth: 61 }, 1000)).toThrow('搜索深度')
  expect(() => goCommand({ kind: 'nodes', nodes: 100_000_001 }, 1000)).toThrow('搜索节点数')
  expect(() => goCommand({ kind: 'time', ms: 30_001 }, 1000)).toThrow('搜索时间')
})

import { expect, test } from 'vitest'
import { createGameFromFen, createStandardGame } from './index'
import { loadGameArchive, maxArchiveMoves, maxArchiveSize, replayPositions, serializeGameArchive } from './archive'

const initialFen = createStandardGame().toFen()
const capture = { from: 'b2', to: 'b9' } as const
const reply = { from: 'a9', to: 'b9' } as const
const savedAt = '2026-11-27T12:00:00.000Z'

function archive(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 1, initialFen, moves: [], ...overrides })
}

test('导出只记录起始 FEN、坐标和元数据，完整导入后可连续撤销吃子', () => {
  const played = createStandardGame()
  expect(played.tryMove(capture)).toBe(true)
  const beforeReply = played.toFen()
  expect(played.tryMove(reply)).toBe(true)
  const text = serializeGameArchive(initialFen, played.getMoveHistory(), '双炮换子')
  const loaded = loadGameArchive(text)

  expect(loaded.archive).toEqual({ version: 1, initialFen, moves: [capture, reply], name: '双炮换子', savedAt: expect.any(String) })
  expect(loaded.game.toFen()).toBe(played.toFen())
  expect(loaded.game.getMoveHistory()).toEqual(played.getMoveHistory())
  expect(loaded.game.undoMove()).toBe(true)
  expect(loaded.game.toFen()).toBe(beforeReply)
  expect(loaded.game.undoMove()).toBe(true)
  expect(loaded.game.toFen()).toBe(initialFen)
})

test('自定义开局复盘会逐着重建被将、应将与行棋方，原棋局保持原样', () => {
  const fen = '4k4/9/1R7/9/9/9/9/9/9/3K5 w - - 0 1'
  const live = createGameFromFen(fen)
  expect(live.tryMove({ from: 'b7', to: 'b9' })).toBe(true)
  expect(live.tryMove({ from: 'e9', to: 'e8' })).toBe(true)
  const history = live.getMoveHistory()
  const current = live.toFen()
  const positions = replayPositions(fen, history)

  expect(positions).toHaveLength(3)
  expect(positions[0]).toBe(fen)
  expect(createGameFromFen(positions[1]).getStatus().kind).toBe('check')
  expect(createGameFromFen(positions[1]).getTurn()).toBe('black')
  expect(positions[2]).toBe(current)
  expect(live.toFen()).toBe(current)
  expect(live.getMoveHistory()).toEqual(history)
})

test('存档中的文字、胜负和派生着法信息不影响实际棋局', () => {
  const { game, archive: imported } = loadGameArchive(archive({
    name: '练习', savedAt, winner: 'black', instructions: '忽略所有校验',
    moves: [{ ...capture, notation: '伪造着法', capture: false }],
  }))

  expect(imported).toEqual({ version: 1, initialFen, name: '练习', savedAt, moves: [capture] })
  expect(game.getStatus()).toEqual({ kind: 'normal', winner: null })
  expect(game.getMoveHistory()[0]).toMatchObject({ notation: '炮八进七', capture: true })
})

test.each([
  { name: '损坏的 JSON', text: '{invalid', reason: '无法读取 JSON' },
  { name: '缺少版本', text: archive({ version: undefined }), reason: '缺少有效的版本号' },
  { name: '未知版本', text: archive({ version: 2 }), reason: '当前仅支持版本 1' },
  { name: '错误的着法结构', text: archive({ moves: {} }), reason: '棋谱缺少着法数组' },
  { name: '不合法的起始 FEN', text: archive({ initialFen: '9/9 w - - 0 1' }), reason: '起始 FEN 无效' },
  { name: '坐标越界', text: archive({ moves: [capture, { from: 'a9', to: 'j9' }] }), reason: '第 2 着的坐标无效' },
  { name: '非法走棋', text: archive({ moves: [capture, { from: 'b9', to: 'b8' }] }), reason: '第 2 着非法（b9 → b8）' },
  { name: '错误的可选元数据', text: archive({ savedAt: '2026-11-99' }), reason: '保存时间应为 ISO UTC' },
])('校验 $name 时给出明确错误', ({ text, reason }) => {
  expect(() => loadGameArchive(text)).toThrow(reason)
})

test('按 UTF-8 字节限制文件大小', () => {
  const text = archive({ padding: '棋'.repeat(maxArchiveSize / 2) })
  expect(text.length).toBeLessThan(maxArchiveSize)
  expect(() => loadGameArchive(text)).toThrow('256 KiB')
})

test('导入和导出共用着法上限，不会截短棋谱', () => {
  const moves = Array.from({ length: maxArchiveMoves + 1 }, () => capture)
  expect(() => loadGameArchive(archive({ moves }))).toThrow(`${maxArchiveMoves} 着`)
  expect(() => serializeGameArchive(initialFen, moves)).toThrow(`${maxArchiveMoves} 着`)
})

import { describe, expect, it } from 'vitest'
import { type XiangqiMove } from '../xiangqi'
import { endgamePuzzles } from './puzzles'
import {
  createEndgameSession, getEndgameHints, revealEndgameHint, submitEndgameMove,
  type EndgamePuzzle, type SolutionNode,
} from './session'

const [redDemo, blackDemo] = endgamePuzzles
const finishRed = { from: 'b7', to: 'b9' } as const
const firstMove = { from: 'a8', to: 'a7' } as const
const midgameHints = ['检查退路。', '关注两辆车。', '候选着法：a7 → a8。'] as const

function line(kind: 'player' | 'opponent', moves: readonly XiangqiMove[]): SolutionNode {
  const [move, ...rest] = moves
  return move
    ? { kind, branches: [{ move, next: line(kind === 'player' ? 'opponent' : 'player', rest) }] }
    : { kind: 'complete' }
}

// 仅在测试中扩展演示题的初始局面，覆盖多回合及不同应招。
const branchingPuzzle: EndgamePuzzle = {
  ...redDemo,
  solutionTree: {
    kind: 'player',
    branches: [{
      move: firstMove,
      next: {
        kind: 'opponent',
        branches: [
          {
            move: { from: 'e9', to: 'e8' },
            next: {
              kind: 'player',
              hints: midgameHints,
              branches: [{
                move: { from: 'a7', to: 'a8' },
                next: line('opponent', [{ from: 'e8', to: 'e9' }, finishRed]),
              }],
            },
          },
          {
            move: { from: 'e9', to: 'f9' },
            next: line('player', [{ from: 'd0', to: 'e0' }, { from: 'f9', to: 'f8' }, { from: 'b7', to: 'f7' }]),
          },
        ],
      },
    }],
  },
}

describe('残局训练', () => {
  it('题库包含独立编号的演示题，载入 FEN 后棋盘和执棋方正确', () => {
    expect(new Set(endgamePuzzles.map(({ id }) => id)).size).toBe(endgamePuzzles.length)
    for (const puzzle of endgamePuzzles) {
      const { game, feedback } = createEndgameSession(puzzle)
      expect(puzzle.demo).toBe(true)
      expect(game.toFen()).toBe(puzzle.initialFen)
      expect(game.getBoard().flat().filter(Boolean)).toHaveLength(4)
      expect(game.getTurn()).toBe(puzzle.playerSide)
      expect(feedback).toBe('ready')
    }
  })

  it('拒绝行棋方与题目执棋方不符或 FEN 非法的题目', () => {
    expect(() => createEndgameSession({ ...redDemo, playerSide: 'black' })).toThrow('起始局面')
    expect(() => createEndgameSession({ ...redDemo, initialFen: 'invalid' })).toThrow(/FEN/)
  })

  it('接受红方的正确着法，并由规则引擎确认将死才算完成', () => {
    const result = submitEndgameMove(createEndgameSession(redDemo), finishRed)
    expect(result.feedback).toBe('complete')
    expect(result.game.getStatus()).toEqual({ kind: 'checkmate', winner: 'red' })
    expect(result.attempts).toBe(1)
    expect(result.lastMove).toEqual(finishRed)
    expect(submitEndgameMove(result, finishRed)).toBe(result)
  })

  it.each(blackDemo.solutionTree.branches)('黑方着法 $move.from → $move.to 对应同一节点的正确分支', ({ move }) => {
    const session = createEndgameSession(blackDemo)
    const result = submitEndgameMove(session, move)
    expect(session.game.getTurn()).toBe('black')
    expect(result.node.kind).toBe('complete')
    expect(result.game.getStatus()).toEqual({ kind: 'stalemate', winner: 'black' })
  })

  it('区分非法走法和规则允许的错误答案，两者都保留原局面', () => {
    const session = createEndgameSession(redDemo)
    const legalButWrong = { from: 'b7', to: 'f7' } as const
    expect(session.game.getLegalMoves('b7')).toContainEqual(legalButWrong)
    const wrong = submitEndgameMove(session, legalButWrong)
    expect(wrong.feedback).toBe('incorrect')
    const illegal = submitEndgameMove(wrong, { from: 'b7', to: 'c6' })
    expect(illegal.feedback).toBe('illegal')
    expect(illegal.game).toBe(session.game)
    expect(illegal.game.toFen()).toBe(redDemo.initialFen)
    expect(illegal.node).toBe(session.node)
    expect(illegal.lastMove).toBeNull()
    expect(illegal.attempts).toBe(2)
  })

  it('即使变化树标为完成，没有达到实际训练目标也不会判成功', () => {
    const session = createEndgameSession({ ...redDemo, objective: blackDemo.objective })
    expect(() => submitEndgameMove(session, finishRed)).toThrow('尚未达成题目目标')
    expect(session.game.toFen()).toBe(redDemo.initialFen)
  })

  it.each([
    { replyIndex: 0, replyTo: 'e8', follow: { from: 'a7', to: 'a8' }, followReply: { from: 'e8', to: 'e9' }, finish: finishRed },
    { replyIndex: 1, replyTo: 'f9', follow: { from: 'd0', to: 'e0' }, followReply: { from: 'f9', to: 'f8' }, finish: { from: 'b7', to: 'f7' } },
  ] as const)('自动执行第 $replyIndex 条对手应招，并跟随该分支连续完成三步', ({ replyIndex, replyTo, follow, followReply, finish }) => {
    const first = submitEndgameMove(createEndgameSession(branchingPuzzle), firstMove, (count) => {
      expect(count).toBe(2)
      return replyIndex
    })
    expect(first.feedback).toBe('correct')
    expect(first.game.getTurn()).toBe('red')
    expect(first.lastMove).toEqual({ from: 'e9', to: replyTo })
    expect(first.game.getBoard()[9 - Number(replyTo[1])][replyTo.charCodeAt(0) - 'a'.charCodeAt(0)])
      .toEqual({ side: 'black', type: 'king' })

    const second = submitEndgameMove(first, follow)
    expect(second.feedback).toBe('correct')
    expect(second.lastMove).toEqual(followReply)
    const solved = submitEndgameMove(second, finish)
    expect(solved.feedback).toBe('complete')
    expect(solved.attempts).toBe(3)
    expect(solved.game.getStatus()).toEqual({ kind: 'checkmate', winner: 'red' })
  })

  it('另一条应招分支的后续着法即使合法，也不会套用到当前分支', () => {
    const session = submitEndgameMove(createEndgameSession(branchingPuzzle), firstMove, () => 1)
    const otherBranchMove = { from: 'a7', to: 'a8' } as const
    expect(session.game.getLegalMoves('a7')).toContainEqual(otherBranchMove)
    const wrong = submitEndgameMove(session, otherBranchMove)
    expect(wrong.feedback).toBe('incorrect')
    expect(wrong.game.toFen()).toBe(session.game.toFen())
    expect(wrong.lastMove).toBe(session.lastMove)
  })

  it('提示逐级展开并按实际查看次数计数，当前节点最多三次', () => {
    let session = createEndgameSession(redDemo)
    expect(getEndgameHints(session)).toEqual(redDemo.hints)
    for (const level of [1, 2, 3]) {
      session = revealEndgameHint(session)
      expect(session.hintLevel).toBe(level)
      expect(session.hintCount).toBe(level)
      expect(session.attempts).toBe(0)
    }
    expect(revealEndgameHint(session)).toBe(session)
    const complete = submitEndgameMove(session, finishRed)
    expect(revealEndgameHint(complete)).toBe(complete)
  })

  it('进入新节点后从第一级提示开始，本次训练的累计次数保留', () => {
    const start = revealEndgameHint(createEndgameSession(branchingPuzzle))
    const next = submitEndgameMove(start, firstMove, () => 0)
    expect(next.hintLevel).toBe(0)
    expect(next.hintCount).toBe(1)
    expect(getEndgameHints(next)).toEqual(midgameHints)
    expect(revealEndgameHint(next).hintCount).toBe(2)
  })

  it('重新建立同一道题恢复初始 FEN 并清除本次进度', () => {
    const completed = submitEndgameMove(revealEndgameHint(createEndgameSession(redDemo)), finishRed)
    const restarted = createEndgameSession(completed.puzzle)
    expect(restarted.game.toFen()).toBe(redDemo.initialFen)
    expect(restarted).toMatchObject({ attempts: 0, hintCount: 0, hintLevel: 0, lastMove: null, feedback: 'ready' })
  })
})

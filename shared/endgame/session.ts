import { createGameFromFen, type XiangqiGame, type XiangqiMove, type XiangqiSide } from '../xiangqi'

export type EndgameHints = readonly [direction: string, piece: string, move: string]

export interface SolutionBranch {
  readonly move: XiangqiMove
  readonly next: SolutionNode
}

interface PlayerNode {
  readonly kind: 'player'
  readonly branches: readonly SolutionBranch[]
  readonly hints?: EndgameHints
}

export type SolutionNode = PlayerNode
  | { readonly kind: 'opponent'; readonly branches: readonly SolutionBranch[] }
  | { readonly kind: 'complete' }

export interface EndgamePuzzle {
  readonly id: string
  readonly title: string
  readonly initialFen: string
  readonly playerSide: XiangqiSide
  readonly difficulty: string
  readonly category: string
  readonly objective: { readonly kind: 'checkmate' | 'stalemate'; readonly text: string }
  readonly hints: EndgameHints
  readonly explanation: string
  readonly solutionTree: PlayerNode
  readonly demo?: boolean
}

export interface EndgameSession {
  readonly puzzle: EndgamePuzzle
  readonly game: XiangqiGame
  readonly node: PlayerNode | { readonly kind: 'complete' }
  readonly lastMove: XiangqiMove | null
  readonly attempts: number
  readonly hintCount: number
  readonly hintLevel: number
  readonly feedback: 'ready' | 'illegal' | 'incorrect' | 'correct' | 'complete'
}

export function createEndgameSession(puzzle: EndgamePuzzle): EndgameSession {
  const game = createGameFromFen(puzzle.initialFen)
  if (game.getTurn() !== puzzle.playerSide || game.getStatus().winner || puzzle.solutionTree.branches.length === 0) {
    throw new Error('起始局面应可行棋，且轮到玩家执棋的一方。')
  }

  return { puzzle, game, node: puzzle.solutionTree, lastMove: null, attempts: 0, hintCount: 0, hintLevel: 0, feedback: 'ready' }
}

export function submitEndgameMove(
  session: EndgameSession,
  move: XiangqiMove,
  chooseReply = (count: number) => Math.floor(Math.random() * count),
): EndgameSession {
  if (session.node.kind === 'complete') return session

  const attempts = session.attempts + 1
  // 先在独立棋局验证。走法合法但不符合题目时，当前训练棋局保持原样。
  const game = createGameFromFen(session.game.toFen())
  if (!game.tryMove(move)) return { ...session, attempts, feedback: 'illegal' }

  const branch = session.node.branches.find(({ move: answer }) => answer.from === move.from && answer.to === move.to)
  if (!branch) return { ...session, attempts, feedback: 'incorrect' }

  let node = branch.next
  let lastMove = move
  if (node.kind === 'opponent') {
    const reply = node.branches[chooseReply(node.branches.length)]
    if (!reply || game.getTurn() === session.puzzle.playerSide || !game.tryMove(reply.move)) {
      throw new Error('题目的预设应招无效。')
    }
    node = reply.next
    lastMove = reply.move
  }

  const status = game.getStatus()
  if (node.kind === 'complete') {
    if (status.kind !== session.puzzle.objective.kind || status.winner !== session.puzzle.playerSide) {
      throw new Error('答案结束时尚未达成题目目标。')
    }
  } else if (node.kind !== 'player' || node.branches.length === 0 || game.getTurn() !== session.puzzle.playerSide || status.winner) {
    throw new Error('题目的后续变化无法继续。')
  }

  return { ...session, game, node, lastMove, attempts, hintLevel: 0, feedback: node.kind === 'complete' ? 'complete' : 'correct' }
}

export function getEndgameHints(session: EndgameSession): EndgameHints {
  return (session.node.kind === 'player' ? session.node.hints : undefined) ?? session.puzzle.hints
}

export function revealEndgameHint(session: EndgameSession): EndgameSession {
  if (session.node.kind === 'complete' || session.hintLevel === 3) return session
  return { ...session, hintLevel: session.hintLevel + 1, hintCount: session.hintCount + 1 }
}

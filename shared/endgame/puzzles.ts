import type { EndgamePuzzle } from './session'

export const endgamePuzzles = [
  {
    id: 'demo-red-mate',
    title: '双车封宫',
    initialFen: '4k4/R8/1R7/9/9/9/9/9/9/3K5 w - - 0 1',
    playerSide: 'red',
    difficulty: '入门',
    category: '一步将死',
    objective: { kind: 'checkmate', text: '红方走一着，将死黑方。' },
    hints: ['先封住黑将的退路，再从底线发起将军。', 'a8 的红车已经封住第 8 横线，留意 b7 的红车。', '候选着法：b7 → b9。'],
    explanation: 'b7 的红车进到 b9，从底线将军。另一辆红车封住 e8，黑将横走也无法避开底线上的红车。',
    solutionTree: { kind: 'player', branches: [{ move: { from: 'b7', to: 'b9' }, next: { kind: 'complete' } }] },
    demo: true,
  },
  {
    id: 'demo-black-stalemate',
    title: '双车封路',
    initialFen: '3k5/9/9/9/9/9/9/6r2/r8/4K4 b - - 0 1',
    playerSide: 'black',
    difficulty: '入门',
    category: '一步困毙',
    objective: { kind: 'stalemate', text: '黑方走一着，让红方无合法着法，达成困毙。' },
    hints: ['封住红帅还能到达的交点。', '两辆黑车都可以封住 f0，同时保持对 e1 的控制。', '候选着法：g2 → f2 或 a1 → f1。'],
    explanation: '任意一辆黑车来到 f 列都能封住 f0，另一条退路 e1 仍受黑车控制。红帅也不能走到 d0 与黑将照面，因此红方无棋可走。',
    solutionTree: {
      kind: 'player',
      branches: [
        { move: { from: 'g2', to: 'f2' }, next: { kind: 'complete' } },
        { move: { from: 'a1', to: 'f1' }, next: { kind: 'complete' } },
      ],
    },
    demo: true,
  },
] as const satisfies readonly EndgamePuzzle[]

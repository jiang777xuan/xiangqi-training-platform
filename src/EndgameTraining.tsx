import { useState } from 'react'
import type { XiangqiSide, XiangqiSquare } from '../shared/xiangqi'
import { endgamePuzzles } from '../shared/endgame/puzzles'
import { loadTrainingRecords, saveTrainingRecords, updateTrainingRecords } from '../shared/endgame/records'
import { createEndgameSession, getEndgameHints, revealEndgameHint, submitEndgameMove } from '../shared/endgame/session'
import { BoardSurface } from './BoardSurface'
import { sideNames } from './boardLabels'

const feedbackText = {
  ready: '选中己方棋子，然后点击落点。',
  illegal: '这步走法不符合象棋规则，请重试。',
  incorrect: '这步走法合法，但不属于本题答案。局面已保留，请重试。',
  correct: '走法正确。对手已应招，请继续。',
  complete: '训练完成',
}
const hintLabels = ['战术方向', '关键棋子', '候选着法']

export function EndgameTraining() {
  const [index, setIndex] = useState(0)
  const [session, setSession] = useState(() => createEndgameSession(endgamePuzzles[0]))
  const [records, setRecords] = useState(loadTrainingRecords)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [selected, setSelected] = useState<XiangqiSquare | null>(null)
  const [problem, setProblem] = useState('')
  const { puzzle, game } = session
  const turn = game.getTurn()
  const complete = session.node.kind === 'complete'
  const interactive = !complete && turn === puzzle.playerSide
  const destinations = new Set(interactive && selected ? game.getLegalMoves(selected).map(({ to }) => to) : [])
  const hints = getEndgameHints(session)
  const record = records.find(({ puzzleId }) => puzzleId === puzzle.id)

  function recordEvent(event: Parameters<typeof updateTrainingRecords>[2]) {
    const updated = updateTrainingRecords(records, puzzle.id, event)
    setRecords(updated)
    setStorageAvailable(saveTrainingRecords(updated))
  }

  function openPuzzle(nextIndex: number) {
    setIndex(nextIndex)
    setSession(createEndgameSession(endgamePuzzles[nextIndex]))
    setSelected(null)
    setProblem('')
  }

  function hint() {
    const next = revealEndgameHint(session)
    if (next === session) return
    setSession(next)
    recordEvent('hint')
  }

  function selectSquare(square: XiangqiSquare, side?: XiangqiSide) {
    if (!interactive) return
    if (selected && destinations.has(square)) {
      setSelected(null)
      setProblem('')
      try {
        const next = submitEndgameMove(session, { from: selected, to: square })
        setSession(next)
        const event = next.feedback === 'complete' ? 'complete' : next.feedback === 'correct' ? 'correct' : 'incorrect'
        recordEvent(event)
      } catch {
        setProblem('这道题的预设变化有误。请重新开始或切换题目。')
      }
    } else if (side === puzzle.playerSide) {
      setSelected((current) => current === square ? null : square)
    }
  }

  return (
    <main id="endgames" className="container endgame-page">
      <header className="endgame-header">
        <div>
          <h1>残局闯关</h1>
          <p>按题目目标走棋，完成后查看解析。</p>
        </div>
        <label className="endgame-chooser">
          选择题目
          <select value={index} onChange={(event) => openPuzzle(Number(event.target.value))}>
            {endgamePuzzles.map((entry, position) => <option key={entry.id} value={position}>{entry.title}</option>)}
          </select>
        </label>
      </header>

      <div className="endgame-layout">
        <BoardSurface
          board={game.getBoard()}
          turn={turn}
          interactive={interactive}
          selectedSquare={selected}
          destinations={destinations}
          lastMove={session.lastMove}
          onSquareClick={selectSquare}
        >
          <span className="board-status" role="status">
            {complete ? `${sideNames[puzzle.playerSide]}达成训练目标` : `${sideNames[turn]}行棋${game.getStatus().kind === 'check' ? ' · 请应将' : ''}`}
          </span>
        </BoardSurface>

        <section className="endgame-details" aria-labelledby="endgame-title">
          <div className="endgame-summary">
            <p className="endgame-category">{puzzle.demo ? '演示题 · ' : ''}{puzzle.difficulty} · {puzzle.category}</p>
            <h2 id="endgame-title">{puzzle.title}</h2>
            <h3>训练目标</h3>
            <p>{puzzle.objective.text}</p>
          </div>

          <div className="endgame-actions">
            <button type="button" onClick={hint} disabled={complete || session.hintLevel === 3}>
              {session.hintLevel === 3 ? '提示已全部展开' : `提示 ${session.hintLevel + 1}/3`}
            </button>
            <button type="button" onClick={() => openPuzzle(index)}>重新开始</button>
            <button type="button" onClick={() => openPuzzle(index + 1)} disabled={index === endgamePuzzles.length - 1}>下一题</button>
          </div>

          {!complete && session.hintLevel > 0 && (
            <ol className="endgame-hints" aria-label="已查看的分级提示">
              {hints.slice(0, session.hintLevel).map((text, level) => <li key={hintLabels[level]}><strong>{hintLabels[level]}</strong> {text}</li>)}
            </ol>
          )}

          <div className="endgame-feedback" data-feedback={session.feedback} role="status">
            <strong>{problem || feedbackText[session.feedback]}</strong>
            {complete && <p>{puzzle.explanation}</p>}
          </div>
          <p className="endgame-progress">本次尝试 {session.attempts} 着 · 使用提示 {session.hintCount} 次</p>
          {record?.completed && <p className="endgame-progress">本机已完成 · 累计尝试 {record.attempts} 着 · 累计提示 {record.hintCount} 次</p>}
          {!storageAvailable && <p className="endgame-progress" role="status">浏览器存储不可用，记录保留在当前页面。</p>}
        </section>
      </div>
    </main>
  )
}

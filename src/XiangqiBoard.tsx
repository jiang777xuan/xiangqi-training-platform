import { Fragment, useEffect, useRef, useState } from 'react'
import { createStandardGame, type XiangqiMoveRecord, type XiangqiPieceType, type XiangqiSide, type XiangqiSquare } from '../shared/xiangqi'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const
const ranks = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const
const filePositions = files.map((_, index) => `${(index / (files.length - 1)) * 100}%`)
const rankPositions = ranks.map((_, index) => `${(index / (ranks.length - 1)) * 100}%`)

const sideNames = { red: '红方', black: '黑方' }
const sides = ['red', 'black'] as const
const pieceNames: Record<XiangqiSide, Record<XiangqiPieceType, string>> = {
  red: { rook: '俥', horse: '傌', elephant: '相', advisor: '仕', king: '帥', cannon: '炮', pawn: '兵' },
  black: { rook: '車', horse: '馬', elephant: '象', advisor: '士', king: '將', cannon: '砲', pawn: '卒' },
}

function moveText(move: XiangqiMoveRecord | undefined) {
  if (!move) return '—'
  if (move.notation !== null) return move.notation

  return (
    <>
      {pieceNames[move.side][move.piece]} {move.from}–{move.to}
      <small className="move-coordinate-label">坐标记录</small>
    </>
  )
}

export function XiangqiBoard() {
  const [game, setGame] = useState(createStandardGame)
  const [history, setHistory] = useState(() => game.getMoveHistory())
  const [selectedSquare, setSelectedSquare] = useState<XiangqiSquare | null>(null)
  const historyScroll = useRef<HTMLDivElement>(null)
  const lastMove = history.at(-1)
  const board = game.getBoard()
  const turn = game.getTurn()
  const status = game.getStatus()
  const gameOver = status.winner !== null
  const currentRound = gameOver && lastMove ? lastMove.round : game.getRound()
  const destinations = new Set(selectedSquare ? game.getLegalMoves(selectedSquare).map(({ to }) => to) : [])
  const rounds = new Map<number, Partial<Record<XiangqiSide, XiangqiMoveRecord>>>()
  for (const move of history) {
    const row = rounds.get(move.round) ?? {}
    row[move.side] = move
    rounds.set(move.round, row)
  }

  useEffect(() => {
    const scroll = historyScroll.current
    if (scroll) scroll.scrollTop = scroll.scrollHeight
  }, [lastMove])

  let statusText = `${sideNames[turn]}行棋`
  if (status.winner !== null) {
    const result = status.kind === 'checkmate' ? '被将死' : '困毙'
    statusText = `${sideNames[status.winner]}获胜 · ${sideNames[turn]}${result}`
  } else if (status.kind === 'check') {
    statusText += ' · 被将军，请应将'
  }

  function handleSquareClick(square: XiangqiSquare, side?: XiangqiSide) {
    if (gameOver) return

    if (selectedSquare && destinations.has(square)) {
      const move = { from: selectedSquare, to: square }
      if (game.tryMove(move)) {
        setHistory(game.getMoveHistory())
        setSelectedSquare(null)
      }
      return
    }

    if (side === turn) {
      setSelectedSquare((current) => current === square ? null : square)
    }
  }

  function handleUndo() {
    if (game.undoMove()) {
      setHistory(game.getMoveHistory())
      setSelectedSquare(null)
    }
  }

  function handleRestart() {
    const newGame = createStandardGame()
    setGame(newGame)
    setHistory(newGame.getMoveHistory())
    setSelectedSquare(null)
  }

  return (
    <div className="board-play">
      <figure className="board-figure">
        <div className="board-frame">
          <div className="board-grid">
            <div className="board-lines" aria-hidden="true">
              {filePositions.map((left) => (
                <div className="board-file" key={left} style={{ left }} />
              ))}
              {rankPositions.map((top) => (
                <div className="board-rank" key={top} style={{ top }} />
              ))}
              <div className="board-palace board-palace-top" />
              <div className="board-palace board-palace-bottom" />
              <div className="board-river"><span>楚河</span><span>漢界</span></div>
            </div>
            {board.map((row, rowIndex) => row.map((piece, fileIndex) => {
              const square: XiangqiSquare = `${files[fileIndex]}${ranks[rowIndex]}`
              const isDestination = destinations.has(square)
              const wasFrom = lastMove?.from === square
              const wasTo = lastMove?.to === square
              if (!piece && !isDestination && !wasFrom && !wasTo) return null

              const position = { left: filePositions[fileIndex], top: rankPositions[rowIndex] }
              return (
                <Fragment key={square}>
                  {(wasFrom || wasTo) && (
                    <span
                      className={`board-last-move ${wasFrom ? 'board-last-move-from' : 'board-last-move-to'}`}
                      data-square={square}
                      aria-hidden="true"
                      style={position}
                    />
                  )}
                  {piece && (
                    <button
                      type="button"
                      className={`board-piece${piece.side === 'red' ? ' board-piece-red' : ''}`}
                      data-square={square}
                      aria-label={`${isDestination ? '吃子 ' : ''}${sideNames[piece.side]}${pieceNames[piece.side][piece.type]} ${square}`}
                      aria-pressed={!gameOver && piece.side === turn ? selectedSquare === square : undefined}
                      disabled={gameOver || (piece.side !== turn && !isDestination)}
                      style={position}
                      onClick={() => handleSquareClick(square, piece.side)}
                    >
                      <span className="board-piece-face">{pieceNames[piece.side][piece.type]}</span>
                    </button>
                  )}
                  {isDestination && (piece ? (
                    <span
                      className="board-target board-target-capture"
                      data-square={square}
                      aria-hidden="true"
                      style={position}
                    />
                  ) : (
                    <button
                      type="button"
                      className="board-target"
                      data-square={square}
                      aria-label={`走到 ${square}`}
                      style={position}
                      onClick={() => handleSquareClick(square)}
                    />
                  ))}
                </Fragment>
              )
            }))}
          </div>
        </div>
        <figcaption>
          <span className="board-status" role="status" data-state={status.kind}>{statusText}</span>
          {status.kind === 'normal' && ' · 选棋后点击落点'}
          <span className="board-announcement" role="status">
            {selectedSquare && (destinations.size > 0
              ? `${selectedSquare} 的合法落点为 ${[...destinations].join('、')}`
              : `${selectedSquare} 没有合法落点`)}
          </span>
        </figcaption>
      </figure>

      <section className="move-panel" aria-label="棋谱与对局操作">
        <div className="move-panel-header">
          <h2>棋谱</h2>
          <span className="move-current-round">第 {currentRound} 回合</span>
        </div>
        <div className="move-history-scroll" ref={historyScroll} role="region" aria-label="着法列表" tabIndex={0}>
          <table className="move-history" aria-label="棋谱">
            <thead>
              <tr>
                <th scope="col">回合</th>
                <th scope="col">红方</th>
                <th scope="col">黑方</th>
              </tr>
            </thead>
            <tbody>
              {[...rounds].map(([number, moves]) => (
                <tr key={number} aria-current={number === currentRound ? 'step' : undefined}>
                  <th scope="row">{number}</th>
                  {sides.map((side) => (
                    <td key={side} title={moves[side]?.capture ? '吃子' : undefined}>
                      {moveText(moves[side])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <p className="move-history-empty">暂无着法</p>}
        </div>
        <div className="move-panel-controls">
          <button type="button" onClick={handleUndo} disabled={history.length === 0}>悔棋</button>
          <button type="button" onClick={handleRestart}>重新开始</button>
        </div>
      </section>
    </div>
  )
}

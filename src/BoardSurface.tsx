import { Fragment, type ReactNode } from 'react'
import type { XiangqiBoard, XiangqiMove, XiangqiSide, XiangqiSquare } from '../shared/xiangqi'
import { pieceNames, sideNames } from './boardLabels'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const
const ranks = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const
const filePositions = files.map((_, index) => `${(index / (files.length - 1)) * 100}%`)
const rankPositions = ranks.map((_, index) => `${(index / (ranks.length - 1)) * 100}%`)

interface BoardSurfaceProps {
  board: XiangqiBoard
  turn: XiangqiSide
  interactive: boolean
  selectedSquare: XiangqiSquare | null
  destinations: ReadonlySet<XiangqiSquare>
  lastMove?: XiangqiMove | null
  analysisMove?: XiangqiMove | null
  onSquareClick: (square: XiangqiSquare, side?: XiangqiSide) => void
  children: ReactNode
}

export function BoardSurface({ board, turn, interactive, selectedSquare, destinations, lastMove, analysisMove, onSquareClick, children }: BoardSurfaceProps) {
  return (
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
            const analysisFrom = analysisMove?.from === square
            const analysisTo = analysisMove?.to === square
            if (!piece && !isDestination && !wasFrom && !wasTo && !analysisFrom && !analysisTo) return null

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
                    aria-pressed={interactive && piece.side === turn ? selectedSquare === square : undefined}
                    disabled={!interactive || (piece.side !== turn && !isDestination)}
                    style={position}
                    onClick={() => onSquareClick(square, piece.side)}
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
                    onClick={() => onSquareClick(square)}
                  />
                ))}
                {(analysisFrom || analysisTo) && (
                  <span aria-hidden="true" className={`board-analysis-mark ${analysisFrom ? 'board-analysis-from' : 'board-analysis-to'}`}
                    style={position} data-square={square} />
                )}
              </Fragment>
            )
          }))}
        </div>
      </div>
      <figcaption>{children}</figcaption>
    </figure>
  )
}

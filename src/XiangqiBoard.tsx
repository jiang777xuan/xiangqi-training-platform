import { Fragment, useState } from 'react'
import { createStandardGame, type XiangqiPieceType, type XiangqiSide, type XiangqiSquare } from '../shared/xiangqi'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const
const ranks = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const
const filePositions = files.map((_, index) => `${(index / (files.length - 1)) * 100}%`)
const rankPositions = ranks.map((_, index) => `${(index / (ranks.length - 1)) * 100}%`)

const sideNames = { red: '红方', black: '黑方' }
const pieceNames: Record<XiangqiSide, Record<XiangqiPieceType, string>> = {
  red: { rook: '俥', horse: '傌', elephant: '相', advisor: '仕', king: '帥', cannon: '炮', pawn: '兵' },
  black: { rook: '車', horse: '馬', elephant: '象', advisor: '士', king: '將', cannon: '砲', pawn: '卒' },
}

export function XiangqiBoard() {
  const [game] = useState(createStandardGame)
  const [selectedSquare, setSelectedSquare] = useState<XiangqiSquare | null>(null)
  const board = game.getBoard()
  const turn = game.getTurn()
  const destinations = new Set(selectedSquare ? game.getLegalMoves(selectedSquare).map(({ to }) => to) : [])

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
            if (!piece && !isDestination) return null

            const position = { left: filePositions[fileIndex], top: rankPositions[rowIndex] }
            return (
              <Fragment key={square}>
                {piece && (
                  <button
                    type="button"
                    className={`board-piece${piece.side === 'red' ? ' board-piece-red' : ''}`}
                    data-square={square}
                    aria-label={`${sideNames[piece.side]}${pieceNames[piece.side][piece.type]} ${square}`}
                    aria-pressed={piece.side === turn ? selectedSquare === square : undefined}
                    disabled={piece.side !== turn}
                    style={position}
                    onClick={() => setSelectedSquare((current) => current === square ? null : square)}
                  >
                    <span className="board-piece-face">{pieceNames[piece.side][piece.type]}</span>
                  </button>
                )}
                {isDestination && (
                  <span
                    className={`board-target${piece ? ' board-target-capture' : ''}`}
                    data-square={square}
                    aria-hidden="true"
                    style={position}
                  />
                )}
              </Fragment>
            )
          }))}
        </div>
      </div>
      <figcaption>
        {sideNames[turn]}行棋 · 选子查看合法落点
        <span className="board-announcement" role="status">
          {selectedSquare && (destinations.size > 0
            ? `${selectedSquare} 的合法落点为 ${[...destinations].join('、')}`
            : `${selectedSquare} 没有合法落点`)}
        </span>
      </figcaption>
    </figure>
  )
}

const startingPosition = [
  '車馬象士將士象馬車',
  '         ',
  ' 砲     砲 ',
  '卒 卒 卒 卒 卒',
  '         ',
  '         ',
  '兵 兵 兵 兵 兵',
  ' 炮     炮 ',
  '         ',
  '俥傌相仕帥仕相傌俥',
]

const files = Array.from({ length: 9 }, (_, file) => file)

export function XiangqiBoard() {
  return (
    <figure className="board-figure">
      <div className="board-frame" aria-hidden="true">
        <div className="board-grid">
          {files.map((file) => (
            <div className="board-file" key={file} style={{ left: `${file * 12.5}%` }} />
          ))}
          {startingPosition.map((_, rank) => (
            <div className="board-rank" key={rank} style={{ top: `${(rank / 9) * 100}%` }} />
          ))}
          <div className="board-palace board-palace-top" />
          <div className="board-palace board-palace-bottom" />
          <div className="board-river"><span>楚河</span><span>漢界</span></div>
          {startingPosition.map((row, rank) =>
            Array.from(row, (piece, file) =>
              piece === ' ' ? null : (
                <span
                  className={`board-piece ${rank > 4 ? 'board-piece-red' : ''}`}
                  key={`${rank}-${file}`}
                  style={{ left: `${file * 12.5}%`, top: `${(rank / 9) * 100}%` }}
                >
                  {piece}
                </span>
              ),
            ),
          )}
        </div>
      </div>
      <figcaption>中国象棋 · 初始布局</figcaption>
    </figure>
  )
}

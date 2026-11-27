import { Chess, type Color, type PieceSymbol } from '@weshell/xiangqi.js'

export type XiangqiSide = 'red' | 'black'
export type XiangqiPieceType = 'king' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn'
export type XiangqiSquare = `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i'}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

export interface XiangqiMove {
  readonly from: XiangqiSquare
  readonly to: XiangqiSquare
}

export interface XiangqiPiece {
  readonly side: XiangqiSide
  readonly type: XiangqiPieceType
}

export type XiangqiBoard = ReadonlyArray<ReadonlyArray<XiangqiPiece | null>>

export interface XiangqiGame {
  /** 棋盘按黑方底线到红方底线排列，每行从左到右，空位为 null。 */
  getBoard(): XiangqiBoard
  getTurn(): XiangqiSide
  toFen(): string
  /** 查询当前行棋方在指定位置的合法着法。 */
  getLegalMoves(from: XiangqiSquare): readonly XiangqiMove[]
  /** 执行成功时返回 true，着法非法时返回 false 并保留当前局面。 */
  tryMove(move: XiangqiMove): boolean
}

const sideByColor: Record<Color, XiangqiSide> = {
  w: 'red',
  b: 'black',
}

const typeBySymbol: Record<PieceSymbol, XiangqiPieceType> = {
  k: 'king',
  a: 'advisor',
  b: 'elephant',
  n: 'horse',
  r: 'rook',
  c: 'cannon',
  p: 'pawn',
}

export function createStandardGame(): XiangqiGame {
  return wrapGame(new Chess())
}

export function createGameFromFen(fen: string): XiangqiGame {
  return wrapGame(new Chess(fen))
}

function wrapGame(game: Chess): XiangqiGame {
  function getLegalMoves(from: XiangqiSquare): readonly XiangqiMove[] {
    return game.moves({ square: from, verbose: true }).map(({ from, to }) => ({ from, to }))
  }

  return {
    getBoard() {
      return game.board().map((row) => row.map((piece) => (
        piece === null ? null : {
          side: sideByColor[piece.color],
          type: typeBySymbol[piece.type],
        }
      )))
    },
    getTurn() {
      return sideByColor[game.turn()]
    },
    toFen() {
      return game.fen()
    },
    getLegalMoves,
    tryMove(move) {
      if (!getLegalMoves(move.from).some((candidate) => candidate.to === move.to)) {
        return false
      }

      game.move(move)
      return true
    },
  }
}

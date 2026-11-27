import { Chess, type Color, type PieceSymbol } from '@weshell/xiangqi.js'

export type XiangqiSide = 'red' | 'black'
export type XiangqiPieceType = 'king' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn'

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
  const game = new Chess()

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
  }
}

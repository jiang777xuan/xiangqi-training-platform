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

export type XiangqiGameStatus =
  | { readonly kind: 'normal' | 'check'; readonly winner: null }
  | { readonly kind: 'checkmate' | 'stalemate'; readonly winner: XiangqiSide }

export interface XiangqiGame {
  /** 棋盘按黑方底线到红方底线排列，每行从左到右，空位为 null。 */
  getBoard(): XiangqiBoard
  getTurn(): XiangqiSide
  /** 导出当前局面的六字段 FEN。 */
  toFen(): string
  /** 加载新局面并开始新的历史。失败时抛出错误并保留原棋局。 */
  loadFen(fen: string): void
  /** 根据当前行棋方是否被将、是否还有合法着法判断局面及胜方。 */
  getStatus(): XiangqiGameStatus
  /** 查询当前行棋方在指定位置的合法着法。 */
  getLegalMoves(from: XiangqiSquare): readonly XiangqiMove[]
  /** 执行成功时返回 true，着法非法时返回 false 并保留当前局面。 */
  tryMove(move: XiangqiMove): boolean
  /** 撤销最近一步合法着法，无着法可撤销时返回 false。 */
  undoMove(): boolean
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

/** 从 FEN 创建独立棋局，校验失败时抛出错误。 */
export function createGameFromFen(fen: string): XiangqiGame {
  return wrapGame(readFen(fen))
}

function isFenCounter(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
}

function readFen(fen: string): Chess {
  const trimmedFen = fen.trim()
  const [placement, , , , halfMoves = '0', moveNumber = '1'] = trimmedFen.split(/\s+/)

  // 规则库用 parseInt 读取计数，先检查完整字段以免把错误输入截断。
  if (placement.includes('0')) {
    throw new Error('Invalid FEN: board empty squares must use digits 1 through 9')
  }
  if (!isFenCounter(halfMoves)) {
    throw new Error('Invalid FEN: half-move counter must be a non-negative safe integer')
  }
  if (!isFenCounter(moveNumber) || Number(moveNumber) === 0) {
    throw new Error('Invalid FEN: full-move number must be a positive safe integer')
  }

  return new Chess(trimmedFen)
}

function wrapGame(initialGame: Chess): XiangqiGame {
  let game = initialGame

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
    loadFen(fen) {
      game = readFen(fen)
    },
    getStatus() {
      const inCheck = game.isCheck()
      const hasLegalMoves = game.moves().length > 0

      if (hasLegalMoves) {
        return { kind: inCheck ? 'check' : 'normal', winner: null }
      }

      const turn = sideByColor[game.turn()]
      return {
        kind: inCheck ? 'checkmate' : 'stalemate',
        winner: turn === 'red' ? 'black' : 'red',
      }
    },
    getLegalMoves,
    tryMove(move) {
      if (!getLegalMoves(move.from).some((candidate) => candidate.to === move.to)) {
        return false
      }

      game.move(move)
      return true
    },
    undoMove() {
      return game.undo() !== null
    },
  }
}

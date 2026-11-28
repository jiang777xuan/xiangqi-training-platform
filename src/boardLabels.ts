import type { XiangqiPieceType, XiangqiSide } from '../shared/xiangqi'

export const sideNames = { red: '红方', black: '黑方' }
export const pieceNames: Record<XiangqiSide, Record<XiangqiPieceType, string>> = {
  red: { rook: '俥', horse: '傌', elephant: '相', advisor: '仕', king: '帥', cannon: '炮', pawn: '兵' },
  black: { rook: '車', horse: '馬', elephant: '象', advisor: '士', king: '將', cannon: '砲', pawn: '卒' },
}

import type { XiangqiGameStatus, XiangqiMove, XiangqiMoveRecord, XiangqiSide } from '../../shared/xiangqi/index.ts'

export type SearchLimit =
  | { readonly kind: 'time'; readonly ms: number }
  | { readonly kind: 'depth'; readonly depth: number }
  | { readonly kind: 'nodes'; readonly nodes: number }

export interface AnalysisRequest {
  readonly initialFen: string
  readonly moves?: readonly XiangqiMove[]
  readonly limit?: SearchLimit
  readonly multiPv?: number
}

export type ScoreBound = 'exact' | 'lowerbound' | 'upperbound'
export type UciScore =
  | { readonly kind: 'cp'; readonly value: number; readonly bound: ScoreBound }
  | { readonly kind: 'mate'; readonly value: number; readonly bound: ScoreBound }

export interface AnalysisScore {
  readonly sideToMove: XiangqiSide
  readonly raw: UciScore
  readonly red: UciScore
}

export interface AnalysisVariation {
  readonly multipv: number
  readonly depth: number
  readonly seldepth?: number
  readonly score: AnalysisScore
  readonly nodes?: number
  readonly nps?: number
  readonly timeMs?: number
  readonly pv: readonly XiangqiMoveRecord[]
}

export interface AnalysisResult {
  readonly kind: 'analysis' | 'partial' | 'terminal' | 'rule-disagreement'
  readonly fen: string
  readonly sideToMove: XiangqiSide
  readonly status: XiangqiGameStatus
  readonly requestedMultiPv: number
  readonly expectedMultiPv: number
  readonly depth: number | null
  readonly elapsedMs: number
  readonly bestMove: XiangqiMoveRecord | null
  readonly ponder: XiangqiMoveRecord | null
  readonly variations: readonly AnalysisVariation[]
  readonly warnings: readonly string[]
}

export type EngineErrorCode =
  | 'configuration' | 'position' | 'launch' | 'exited' | 'engine-error'
  | 'protocol' | 'invalid-bestmove' | 'timeout' | 'cancelled' | 'closed'

export class PikafishError extends Error {
  readonly code: EngineErrorCode

  constructor(code: EngineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PikafishError'
    this.code = code
  }
}

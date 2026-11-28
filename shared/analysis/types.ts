import type { XiangqiGameStatus, XiangqiMove, XiangqiMoveRecord, XiangqiSide } from '../xiangqi/index.ts'

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

export interface HttpAnalysisRequest extends AnalysisRequest {
  readonly requestId: string
}

export interface HttpAnalysisResult extends AnalysisResult {
  readonly requestId: string
}

export interface EngineStatus {
  readonly configured: boolean
  readonly available: boolean
  readonly version: string | null
  readonly analyzing: boolean
  readonly error: { readonly code: ApiErrorCode; readonly message: string } | null
}

export type ApiErrorCode =
  | 'forbidden' | 'invalid-request' | 'json-required' | 'too-large' | 'not-found'
  | 'not-configured' | 'engine-unavailable' | 'engine-failed' | 'busy'
  | 'duplicate-request' | 'request-not-active' | 'cancelled' | 'timeout' | 'internal'

export interface ApiErrorResponse {
  readonly error: { readonly code: ApiErrorCode; readonly message: string }
}


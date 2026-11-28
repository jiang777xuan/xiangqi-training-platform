export type { AnalysisRequest, AnalysisResult, AnalysisScore, AnalysisVariation, ScoreBound, SearchLimit, UciScore } from '../../shared/analysis/types.ts'

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

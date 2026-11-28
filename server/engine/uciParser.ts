import type { XiangqiMove, XiangqiSide, XiangqiSquare } from '../../shared/xiangqi/index.ts'
import type { AnalysisScore, ScoreBound, UciScore } from './types.ts'

export interface UciInfo {
  readonly kind: 'info'
  readonly depth: number
  readonly seldepth?: number
  readonly multipv: number
  readonly score: UciScore
  readonly nodes?: number
  readonly nps?: number
  readonly timeMs?: number
  readonly pv: readonly XiangqiMove[]
}

export interface UciBestMove {
  readonly kind: 'bestmove'
  readonly move: XiangqiMove | null
  readonly ponder: XiangqiMove | null
}

export interface UciSpinOption {
  readonly kind: 'spin-option'
  readonly name: string
  readonly min: number
  readonly max: number
}

export type UciMessage = UciInfo | UciBestMove | UciSpinOption
  | { readonly kind: 'engine-version'; readonly version: string }
  | { readonly kind: 'uciok' | 'readyok' | 'invalid-bestmove' }

export function isSquare(value: unknown): value is XiangqiSquare {
  return typeof value === 'string' && value.length === 2 && /^[a-i][0-9]$/.test(value)
}

function parseMove(text: string | undefined): XiangqiMove | undefined {
  if (text?.length !== 4) return undefined
  const from = text.slice(0, 2)
  const to = text.slice(2)
  return isSquare(from) && isSquare(to) ? { from, to } : undefined
}

function integer(text: string | undefined): number | undefined {
  if (!text || !/^-?\d+$/.test(text)) return undefined
  const result = Number(text)
  return Number.isSafeInteger(result) ? result : undefined
}

function noMove(text: string | undefined) {
  return text === '(none)' || text === '0000'
}

function parseBestMove(tokens: string[]): UciMessage {
  const [, main, keyword, reply] = tokens
  const move = noMove(main) ? null : parseMove(main)
  const ponder = noMove(reply) ? null : parseMove(reply)
  if (move === undefined || (tokens.length !== 2 && (
    tokens.length !== 4 || keyword !== 'ponder' || ponder === undefined || !move
  ))) return { kind: 'invalid-bestmove' }
  return { kind: 'bestmove', move, ponder: ponder ?? null }
}

const infoKeys = ['depth', 'seldepth', 'multipv', 'nodes', 'nps', 'time'] as const

function isInfoKey(token: string): token is (typeof infoKeys)[number] {
  return infoKeys.some((key) => key === token)
}

function parseInfo(tokens: string[]): UciInfo | null {
  const numbers: Partial<Record<(typeof infoKeys)[number], number>> = {}
  let score: UciScore | undefined
  const pv: XiangqiMove[] = []
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === 'string' || token === 'refutation' || token === 'currline') break
    if (isInfoKey(token)) {
      const value = integer(tokens[++index])
      if (value === undefined || value < 0 || (token === 'multipv' && value === 0)) return null
      numbers[token] = value
    } else if (token === 'score') {
      const kind = tokens[++index]
      const value = integer(tokens[++index])
      if ((kind !== 'cp' && kind !== 'mate') || value === undefined) return null
      const qualifier = tokens[index + 1]
      const bound: ScoreBound = qualifier === 'lowerbound' || qualifier === 'upperbound' ? qualifier : 'exact'
      if (bound !== 'exact') index += 1
      score = { kind, value, bound }
    } else if (token === 'pv') {
      for (const text of tokens.slice(index + 1)) {
        const move = parseMove(text)
        if (!move) return null
        pv.push(move)
      }
      break
    }
  }
  if (numbers.depth === undefined || !score || pv.length === 0) return null
  const { depth, seldepth, multipv = 1, nodes, nps, time: timeMs } = numbers
  return { kind: 'info', depth, seldepth, multipv, score, nodes, nps, timeMs, pv }
}

export function parseUciLine(line: string): UciMessage | null {
  const trimmed = line.trim()
  if (trimmed === 'uciok' || trimmed === 'readyok') return { kind: trimmed }
  const version = trimmed.match(/^id name Pikafish ([a-z0-9][a-z0-9._-]{0,39})$/i)
  if (version) return { kind: 'engine-version', version: version[1] }
  const tokens = trimmed.split(/\s+/)
  if (tokens[0] === 'bestmove') return parseBestMove(tokens)
  if (tokens[0] === 'info') return parseInfo(tokens)
  if (tokens[0] !== 'option') return null

  const option = trimmed.match(/^option name (.+?) type spin(?: default -?\d+)? min (-?\d+) max (-?\d+)$/)
  if (!option) return null
  const min = integer(option[2])
  const max = integer(option[3])
  return min !== undefined && max !== undefined && min <= max
    ? { kind: 'spin-option', name: option[1], min, max }
    : null
}

export function withScorePerspective(raw: UciScore, sideToMove: XiangqiSide): AnalysisScore {
  const oppositeBound = { exact: 'exact', lowerbound: 'upperbound', upperbound: 'lowerbound' } as const
  const red: UciScore = sideToMove === 'red' ? raw : {
    kind: raw.kind,
    value: raw.value === 0 ? 0 : -raw.value,
    bound: oppositeBound[raw.bound],
  }
  return { sideToMove, raw, red }
}

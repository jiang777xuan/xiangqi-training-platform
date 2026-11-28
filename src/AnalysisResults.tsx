import type { HttpAnalysisResult, UciScore } from '../shared/analysis/types'
import type { XiangqiMove, XiangqiMoveRecord } from '../shared/xiangqi'
import { sideNames } from './boardLabels'

function scoreText(score: UciScore) {
  const bound = score.bound === 'lowerbound' ? '下界 ≥ ' : score.bound === 'upperbound' ? '上界 ≤ ' : ''
  if (score.kind === 'cp') {
    const signed = score.value > 0 ? `+${score.value}` : score.value
    const side = score.value > 0 ? '偏红' : score.value < 0 ? '偏黑' : '均衡'
    return `${bound}cp ${signed}（${side}）`
  }
  const winningSide = score.value > 0 ? '红方' : '黑方'
  const mate = score.value === 0 ? '杀棋评分' : `${winningSide} ${Math.abs(score.value)} 步获胜提示`
  return `${bound}mate ${score.value}（${mate}，可能为将死或困毙）`
}

function moveText({ from, to, notation }: XiangqiMoveRecord) {
  return notation ? `${notation}（${from} → ${to}）` : `${from} → ${to}`
}

function MoveSequence({ moves }: { moves: readonly XiangqiMoveRecord[] }) {
  return <p className="analysis-pv">{moves.map((move, index) => <span key={index}>{moveText(move)}</span>)}</p>
}

export function AnalysisResults({ result, marked, onHighlight }: {
  result: HttpAnalysisResult
  marked: boolean
  onHighlight: (move: XiangqiMove | null) => void
}) {
  const best = result.bestMove
  const principal = result.variations.find(({ pv }) => pv[0]?.from === best?.from && pv[0]?.to === best?.to)
  return (
    <div className="analysis-results" data-kind={result.kind}>
      {result.kind === 'terminal' && result.status.winner && (
        <p><strong>对局已结束</strong> · {sideNames[result.status.winner]}获胜 · {result.status.kind === 'checkmate' ? '将死' : '困毙'}</p>
      )}
      {result.kind === 'partial' && <p><strong>候选未完整返回</strong> · 以下为已验证的变化。</p>}
      {result.kind === 'rule-disagreement' && <p><strong>引擎与项目规则的判定不同</strong> · 保留当前棋局状态。</p>}
      {best && (
        <div className="analysis-best">
          <p><strong>最佳着法 {moveText(best)}</strong></p>
          <button type="button" aria-pressed={marked} onClick={() => onHighlight(marked ? null : best)}>
            {marked ? '清除分析高亮' : '在棋盘高亮'}
          </button>
        </div>
      )}
      {principal && <p className="analysis-score"><strong>红方视角</strong> · {scoreText(principal.score.red)}</p>}
      {result.depth !== null && (
        <p className="analysis-metrics">深度 {result.depth} · 耗时 {result.elapsedMs} ms{principal?.nodes !== undefined && ` · ${principal.nodes.toLocaleString('zh-CN')} 节点`}</p>
      )}
      {result.variations.length > 0 && (
        <ol className="analysis-variations" aria-label="候选变化">
          {result.variations.map((variation) => (
            <li key={variation.multipv} value={variation.multipv}>
              <p className="analysis-variation-meta"><strong>{scoreText(variation.score.red)}</strong><span>深度 {variation.depth}</span></p>
              <MoveSequence moves={variation.pv.slice(0, 3)} />
              {variation.pv.length > 3 && (
                <details>
                  <summary>查看后续 {variation.pv.length - 3} 着</summary>
                  <MoveSequence moves={variation.pv.slice(3)} />
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {result.warnings.length > 0 && (
        <ul className="analysis-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      )}
    </div>
  )
}

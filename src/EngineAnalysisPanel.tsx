import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EngineStatus, HttpAnalysisResult } from '../shared/analysis/types'
import type { XiangqiMove } from '../shared/xiangqi'
import { AnalysisResults } from './AnalysisResults'
import { cancelAnalysis, EngineApiError, readEngineStatus, requestAnalysis } from './api/engine'

export interface AnalysisSnapshot {
  readonly initialFen: string
  readonly fen: string
  readonly moves: readonly XiangqiMove[]
  readonly step: number
  readonly reviewing: boolean
}

interface Job {
  readonly snapshot: AnalysisSnapshot
  readonly id: string
  readonly controller: AbortController
  stopping: boolean
}

type Operation = { snapshot: AnalysisSnapshot } & (
  { kind: 'searching' | 'stopping' | 'notice'; text: string }
  | { kind: 'complete'; result: HttpAnalysisResult }
)
type Connection = { check: number } & ({ status: EngineStatus } | { message: string })

function errorText(error: unknown) {
  return error instanceof EngineApiError ? error.message : '无法完成引擎请求，请重试。'
}

export function EngineAnalysisPanel({ snapshot, marked, onHighlight }: {
  snapshot: AnalysisSnapshot
  marked: boolean
  onHighlight: (move: XiangqiMove | null) => void
}) {
  const [time, setTime] = useState(1000)
  const [multiPv, setMultiPv] = useState(1)
  const [check, setCheck] = useState(0)
  const [connection, setConnection] = useState<Connection>()
  const [operation, setOperation] = useState<Operation>()
  const active = useRef<Job | null>(null)
  const state = operation?.snapshot === snapshot ? operation : undefined
  const currentConnection = connection?.check === check ? connection : undefined
  const status = currentConnection && 'status' in currentConnection ? currentConnection.status : undefined
  const occupied = state?.kind === 'searching' || state?.kind === 'stopping'

  useEffect(() => {
    const controller = new AbortController()
    void readEngineStatus(controller.signal).then((status) => {
      if (!controller.signal.aborted) setConnection({ check, status })
    }, (error: unknown) => {
      if (!controller.signal.aborted) setConnection({ check, message: errorText(error) })
    })
    return () => controller.abort()
  }, [check])

  useLayoutEffect(() => {
    function abandon() {
      const job = active.current
      if (!job || job.snapshot !== snapshot) return
      active.current = null
      job.controller.abort()
      if (!job.stopping) void cancelAnalysis(job.id).catch(() => undefined)
    }
    function leavePage() {
      abandon()
      setOperation(undefined)
    }
    window.addEventListener('pagehide', leavePage)
    return () => {
      window.removeEventListener('pagehide', leavePage)
      abandon()
    }
  }, [snapshot])

  async function analyze() {
    if (active.current || !status?.available) return
    const job: Job = { snapshot, id: crypto.randomUUID(), controller: new AbortController(), stopping: false }
    active.current = job
    onHighlight(null)
    setOperation({ snapshot, kind: 'searching', text: '引擎正在分析…' })
    try {
      const result = await requestAnalysis({
        requestId: job.id, initialFen: snapshot.initialFen, moves: snapshot.moves,
        limit: { kind: 'time', ms: time }, multiPv,
      }, job.controller.signal)
      if (active.current !== job || job.stopping) return
      if (result.requestId !== job.id || result.fen !== snapshot.fen) {
        setOperation({ snapshot, kind: 'notice', text: '返回的分析与当前局面不一致，请重新分析。' })
      } else {
        setOperation({ snapshot, kind: 'complete', result })
      }
    } catch (error) {
      if (active.current !== job || job.stopping) return
      const message = errorText(error)
      if (error instanceof EngineApiError && ['network', 'engine-unavailable', 'not-configured', 'engine-failed'].includes(error.code)) {
        setConnection({ check, message })
      }
      setOperation({ snapshot, kind: 'notice', text: message })
    } finally {
      if (active.current === job && !job.stopping) active.current = null
    }
  }

  async function stop() {
    const job = active.current
    if (!job || job.stopping) return
    job.stopping = true
    setOperation({ snapshot, kind: 'stopping', text: '正在停止分析…' })
    let text = '分析已停止。'
    try { await cancelAnalysis(job.id) }
    catch (error) {
      if (!(error instanceof EngineApiError) || error.code !== 'request-not-active') text = errorText(error)
    } finally {
      job.controller.abort()
      if (active.current === job) {
        active.current = null
        setOperation({ snapshot, kind: 'notice', text })
      }
    }
  }

  let connectionLabel = '正在检查引擎连接…'
  if (currentConnection && 'message' in currentConnection) connectionLabel = currentConnection.message
  if (status) {
    connectionLabel = status.available ? ['Pikafish', status.version, status.analyzing ? '忙碌' : '已连接'].filter(Boolean).join(' · ')
      : status.error?.message ?? 'Pikafish 当前不可用。'
  }

  return (
    <div className="analysis-panel-body">
      <div className="analysis-connection">
        <p role="status">{connectionLabel}</p>
        <button type="button" onClick={() => setCheck((value) => value + 1)} disabled={!currentConnection || occupied}>刷新连接</button>
      </div>
      <p className="analysis-snapshot">{snapshot.reviewing ? '复盘' : '当前局面'} · 第 {snapshot.step} 着</p>
      <div className="analysis-options">
        <label>搜索时间
          <select value={time} onChange={(event) => setTime(Number(event.target.value))} disabled={occupied}>
            <option value={500}>快速 · 500 ms</option>
            <option value={1000}>标准 · 1000 ms</option>
            <option value={5000}>深入 · 5000 ms</option>
          </select>
        </label>
        <label>候选着法
          <select value={multiPv} onChange={(event) => setMultiPv(Number(event.target.value))} disabled={occupied}>
            <option value={1}>1 条</option><option value={3}>3 条</option><option value={5}>5 条</option>
          </select>
        </label>
      </div>
      <div className="analysis-actions">
        <button type="button" className="analysis-start" onClick={() => { void analyze() }} disabled={!status?.available || occupied}>分析当前局面</button>
        <button type="button" onClick={() => { void stop() }} disabled={state?.kind !== 'searching'}>停止分析</button>
      </div>
      <p className="analysis-progress" role="status">
        {state?.kind === 'complete' ? '分析已完成。' : state?.text}
      </p>
      {state?.kind === 'complete' && <AnalysisResults result={state.result} marked={marked} onHighlight={onHighlight} />}
    </div>
  )
}

import type { ApiErrorCode, EngineStatus, HttpAnalysisRequest, HttpAnalysisResult } from '../../shared/analysis/types'

export class EngineApiError extends Error {
  readonly code: ApiErrorCode | 'network'

  constructor(code: ApiErrorCode | 'network', message: string) {
    super(message)
    this.code = code
  }
}

const offline = () => new EngineApiError('network', '无法连接本地分析服务。请启动后端后刷新连接。')

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(`/api/engine/${endpoint}`, options) }
  catch (error) {
    if (options?.signal?.aborted) throw error
    throw offline()
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw offline()
  let payload: unknown
  try { payload = await response.json() }
  catch { throw offline() }

  if (!response.ok) {
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = payload.error
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        && 'message' in error && typeof error.message === 'string') {
        throw new EngineApiError(error.code as ApiErrorCode, error.message)
      }
    }
    throw new EngineApiError('internal', '分析服务未能完成请求，请重试。')
  }
  return payload as T
}

function post<T>(endpoint: string, data: object, options?: RequestInit) {
  return request<T>(endpoint, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function readEngineStatus(signal: AbortSignal): Promise<EngineStatus> {
  return request('status', { signal })
}

export function requestAnalysis(data: HttpAnalysisRequest, signal: AbortSignal): Promise<HttpAnalysisResult> {
  return post('analyze', data, { signal })
}

export function cancelAnalysis(requestId: string): Promise<{ requestId: string; cancelled: true }> {
  return post('cancel', { requestId }, { keepalive: true, signal: AbortSignal.timeout(12_000) })
}

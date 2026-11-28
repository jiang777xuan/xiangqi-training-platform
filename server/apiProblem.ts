import type { ApiErrorCode } from '../shared/analysis/types.ts'
import { PikafishError } from './engine/types.ts'

export class ApiProblem extends Error {
  readonly status: number
  readonly code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function apiProblem(error: unknown): ApiProblem {
  if (error instanceof ApiProblem) return error
  if (error instanceof PikafishError) {
    switch (error.code) {
      case 'position': return new ApiProblem(400, 'invalid-request', error.message)
      case 'configuration': return new ApiProblem(400, 'invalid-request', '当前引擎不支持所选分析参数。')
      case 'launch': return new ApiProblem(503, 'engine-unavailable', '无法启动 Pikafish，请检查安装和服务端配置。')
      case 'timeout': return new ApiProblem(504, 'timeout', '分析超过等待时间。请缩短搜索后重试。')
      case 'cancelled': return new ApiProblem(409, 'cancelled', '分析已取消。')
      case 'closed': return new ApiProblem(503, 'engine-unavailable', '分析服务正在关闭。')
      default: return new ApiProblem(502, 'engine-failed', '引擎未能完成分析，请检查 Pikafish 和配套的 NNUE 文件。')
    }
  }
  if (error && typeof error === 'object' && 'type' in error) {
    if (error.type === 'entity.too.large') return new ApiProblem(413, 'too-large', '请求数据超过 64 KiB。')
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      return new ApiProblem(415, 'json-required', '请发送未压缩的 UTF-8 JSON。')
    }
    if (error.type === 'entity.parse.failed' || error.type === 'request.size.invalid') {
      return new ApiProblem(400, 'invalid-request', '无法读取 JSON 请求。')
    }
  }
  return new ApiProblem(500, 'internal', '分析服务发生错误，请重试。')
}

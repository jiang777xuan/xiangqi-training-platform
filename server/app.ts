import express, { type ErrorRequestHandler } from 'express'
import { ApiProblem, apiProblem } from './apiProblem.ts'
import { engineRouter } from './routes/engine.ts'
import type { EngineService } from './services/engineService.ts'

export function createApp(service: EngineService, { apiPort = 3001, webPort = 5173 } = {}) {
  const app = express()
  const hosts = new Set([apiPort, webPort].flatMap((port) => [`127.0.0.1:${port}`, `localhost:${port}`]))
  const origins = new Set([...hosts].map((host) => `http://${host}`))
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    const host = request.headers.host
    const origin = request.headers.origin
    if (!host || !hosts.has(host.toLowerCase()) || (origin !== undefined && !origins.has(origin))
      || request.headers['sec-fetch-site'] === 'cross-site') {
      next(new ApiProblem(403, 'forbidden', '仅接受本地分析服务和本地网页的请求。'))
      return
    }
    next()
  })
  app.get('/api/health', (_request, response) => { response.json({ ok: true }) })
  app.use('/api/engine', engineRouter(service))
  app.use('/api', (_request, _response, next) => { next(new ApiProblem(404, 'not-found', '接口不存在。')) })
  const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.destroyed) return
    if (response.headersSent) {
      next(error)
      return
    }
    const problem = apiProblem(error)
    response.status(problem.status).json({ error: { code: problem.code, message: problem.message } })
  }
  app.use(handleError)
  return app
}

import { randomUUID } from 'node:crypto'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { env, isProduction } from './config/env.js'
import { logger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { globalLimiter } from './middleware/rate-limit.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { adminConfigRouter, configRouter } from './modules/config/config.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { adminOrganisationsRouter, organisationsRouter } from './modules/organisations/organisations.routes.js'
import { auditRouter, staffRouter } from './modules/staff/staff.routes.js'
import { adminUsersRouter, usersRouter } from './modules/users/users.routes.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(
    pinoHttp({
      logger,
      genReqId: (request, response) => {
        const incoming = request.headers['x-request-id']
        const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID()
        response.setHeader('x-request-id', id)
        return id
      },
      autoLogging: { ignore: request => request.url?.startsWith('/api/v1/health') ?? false },
      serializers: {
        req: request => ({ id: request.id, method: request.method, url: request.url }),
        res: response => ({ statusCode: response.statusCode })
      }
    })
  )
  app.use(helmet())
  app.use(compression())
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin) || (!isProduction && /^http:\/\/localhost:\d+$/.test(origin))),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform', 'X-App-Version', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600
    })
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(globalLimiter)

  app.get('/', (_request, response) => {
    response.json({ name: 'AfriGoOS API', version: '1', docs: 'https://github.com/NCDF-Group/Afrigo-backend#api-reference' })
  })

  const api = express.Router()
  api.use('/health', healthRouter)
  api.use('/auth', authRouter)
  api.use('/config', configRouter)
  api.use('/users', usersRouter)
  api.use('/organisations', organisationsRouter)
  api.use('/admin/users', adminUsersRouter)
  api.use('/admin/staff', staffRouter)
  api.use('/admin/audit', auditRouter)
  api.use('/admin/organisations', adminOrganisationsRouter)
  api.use('/admin/config', adminConfigRouter)
  app.use('/api/v1', api)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

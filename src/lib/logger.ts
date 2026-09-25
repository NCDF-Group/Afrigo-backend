import { pino } from 'pino'
import { env, isProduction } from '../config/env.js'

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.refreshToken', '*.token'], censor: '[redacted]' },
  transport: isProduction || env.NODE_ENV === 'test' ? undefined : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
})

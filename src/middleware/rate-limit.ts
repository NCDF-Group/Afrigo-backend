import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'

const message = { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait a moment and try again.' } }

const limiter = (limit: number, windowMinutes: number) =>
  rateLimit({ windowMs: windowMinutes * 60_000, limit: env.NODE_ENV === 'test' ? 10_000 : limit, standardHeaders: 'draft-8', legacyHeaders: false, message })

export const globalLimiter = limiter(300, 1)
export const authLimiter = limiter(20, 10)
export const sensitiveLimiter = limiter(5, 15)

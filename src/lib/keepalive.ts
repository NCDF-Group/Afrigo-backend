import { env, isProduction } from '../config/env.js'
import { logger } from './logger.js'

export function keepAliveTarget() {
  const base = env.KEEPALIVE_URL ?? (isProduction ? env.RENDER_EXTERNAL_URL : undefined)
  if (!base || env.KEEPALIVE_INTERVAL_SECONDS === 0) return null
  return base.includes('/health') ? base : `${base.replace(/\/+$/, '')}/api/v1/health/live`
}

export function startKeepAlive() {
  const target = keepAliveTarget()
  if (!target) return () => {}
  let failures = 0
  const ping = async () => {
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'afrigo-keepalive' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (failures > 0) logger.info({ target }, 'Keep alive recovered')
      failures = 0
    } catch (error) {
      failures++
      if (failures === 1 || failures % 20 === 0) logger.warn({ target, failures, err: error instanceof Error ? error.message : error }, 'Keep alive ping failed')
    }
  }
  const timer = setInterval(() => void ping(), env.KEEPALIVE_INTERVAL_SECONDS * 1000)
  timer.unref()
  void ping()
  logger.info({ target, everySeconds: env.KEEPALIVE_INTERVAL_SECONDS }, 'Keep alive started')
  return () => clearInterval(timer)
}

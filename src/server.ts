import { createApp } from './app.js'
import { env } from './config/env.js'
import { sql } from './db/client.js'
import { logger } from './lib/logger.js'

const server = createApp().listen(env.PORT, '0.0.0.0', () => {
  logger.info(`Afrigo API listening on port ${env.PORT}`)
})

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`)
  server.close(async () => {
    await sql.end({ timeout: 5 })
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', error => logger.error({ err: error }, 'Unhandled rejection'))

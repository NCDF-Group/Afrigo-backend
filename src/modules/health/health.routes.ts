import { Router } from 'express'
import { sql } from '../../db/client.js'

export const healthRouter = Router()

healthRouter.get('/live', (_request, response) => {
  response.json({ status: 'ok' })
})

healthRouter.get('/ready', async (_request, response) => {
  const started = Date.now()
  try {
    await sql`select 1`
    response.json({ status: 'ok', database: 'ok', latencyMs: Date.now() - started })
  } catch {
    response.status(503).json({ status: 'error', database: 'unreachable' })
  }
})

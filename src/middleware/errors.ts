import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export function notFoundHandler(request: Request, response: Response) {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.path}` } })
}

export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction) {
  const requestId = String(request.id ?? '')
  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }, requestId })
    return
  }
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' }, requestId })
    return
  }
  logger.error({ err: error, requestId, path: request.path }, 'Unhandled error')
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }, requestId })
}

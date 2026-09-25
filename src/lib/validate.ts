import type { z } from 'zod'
import { badRequest } from './errors.js'

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw badRequest(
      'VALIDATION_FAILED',
      'Some fields are missing or invalid.',
      result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    )
  }
  return result.data
}

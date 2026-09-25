export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details)
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Sign in to continue.') => new AppError(401, code, message)
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have permission to do this.') => new AppError(403, code, message)
export const notFound = (resource: string) => new AppError(404, 'NOT_FOUND', `${resource} was not found.`)
export const conflict = (code: string, message: string) => new AppError(409, code, message)
export const tooMany = (message = 'Too many attempts. Please wait and try again.') => new AppError(429, 'TOO_MANY_REQUESTS', message)

import type { User } from '../db/schema.js'

declare global {
  namespace Express {
    interface Request {
      auth?: { user: User; sessionId: string }
    }
  }
}

export {}

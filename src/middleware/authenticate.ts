import { and, eq, isNull } from 'drizzle-orm'
import type { NextFunction, Request, Response } from 'express'
import { db } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { unauthorized, forbidden } from '../lib/errors.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { logger } from '../lib/logger.js'
import { can, type Capability } from '../lib/roles.js'

const ACTIVITY_INTERVAL = 5 * 60_000

async function resolve(request: Request) {
  const header = request.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) return null
  const claims = await verifyAccessToken(token)
  if (!claims) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  const [row] = await db
    .select({ user: users })
    .from(users)
    .innerJoin(sessions, and(eq(sessions.id, claims.sid), eq(sessions.userId, users.id), isNull(sessions.revokedAt)))
    .where(eq(users.id, claims.sub))
    .limit(1)
  if (!row || row.user.tokenVersion !== claims.tv) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  if (row.user.status !== 'active') throw forbidden('ACCOUNT_SUSPENDED', 'This account has been suspended. Contact Afrigo support.')
  if (!row.user.lastActiveAt || Date.now() - row.user.lastActiveAt.getTime() > ACTIVITY_INTERVAL) {
    db.update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, row.user.id))
      .catch(error => logger.warn({ err: error }, 'Could not record activity'))
  }
  return { user: row.user, sessionId: claims.sid }
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const auth = await resolve(request)
  if (!auth) throw unauthorized()
  request.auth = auth
  next()
}

export function requireStaff(capability?: Capability) {
  return async (request: Request, response: Response, next: NextFunction) => {
    await requireAuth(request, response, () => {})
    const role = request.auth!.user.staffRole
    if (!role) throw forbidden('STAFF_ONLY', 'This area is for Afrigo staff only.')
    if (capability && !can(role, capability)) throw forbidden()
    next()
  }
}

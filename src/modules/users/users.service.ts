import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from '../../db/client.js'
import { sessions, users, type User } from '../../db/schema.js'
import { verifyPassword } from '../../lib/crypto.js'
import { AppError, conflict, notFound } from '../../lib/errors.js'
import { paged } from '../../lib/pagination.js'
import type { MemberRole } from '../../lib/roles.js'
import { logoutEverywhere, publicUser } from '../auth/auth.service.js'
import type { adminActionSchema, listUsersSchema, updateProfileSchema } from './users.schemas.js'

export async function updateProfile(user: User, input: z.infer<typeof updateProfileSchema>) {
  const [updated] = await db.update(users).set(input).where(eq(users.id, user.id)).returning()
  return publicUser(updated)
}

export async function chooseRole(user: User, role: MemberRole) {
  if (user.role === role) return publicUser(user)
  if (user.role) throw conflict('ROLE_LOCKED', 'Your trade role is already set. Contact Afrigo support to change it.')
  const [updated] = await db.update(users).set({ role }).where(and(eq(users.id, user.id), isNull(users.role))).returning()
  if (!updated) throw conflict('ROLE_LOCKED', 'Your trade role is already set. Contact Afrigo support to change it.')
  return publicUser(updated)
}

export async function deleteAccount(user: User, password: string | undefined) {
  if (user.staffRole === 'super_admin') throw conflict('LAST_OWNER', 'Transfer super administrator access before deleting this account.')
  if (user.passwordHash && !(await verifyPassword(password ?? '', user.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Your password is incorrect.')
  await logoutEverywhere(user.id)
  await db
    .update(users)
    .set({ status: 'deleted', email: `deleted+${user.id}@afrigo.invalid`, firstName: 'Deleted', lastName: 'member', phone: null, avatarUrl: null, passwordHash: null, googleId: null, staffRole: null })
    .where(eq(users.id, user.id))
}

const adminView = (user: User) => ({ ...publicUser(user), platform: user.platform, appVersion: user.appVersion, statusReason: user.statusReason, lastLoginAt: user.lastLoginAt, lastActiveAt: user.lastActiveAt, lockedUntil: user.lockedUntil })

export async function listUsers(filters: z.infer<typeof listUsersSchema>) {
  const conditions: SQL[] = [isNull(users.staffRole)]
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, '')}%`
    conditions.push(or(ilike(users.email, term), ilike(users.firstName, term), ilike(users.lastName, term), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, term))!)
  }
  if (filters.role) conditions.push(eq(users.role, filters.role))
  if (filters.country) conditions.push(eq(users.country, filters.country))
  if (filters.status) conditions.push(eq(users.status, filters.status))
  if (filters.platform) conditions.push(eq(users.platform, filters.platform))
  if (filters.verified) conditions.push(filters.verified === 'true' ? isNotNull(users.emailVerifiedAt) : isNull(users.emailVerifiedAt))
  const where = and(...conditions)
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(users).where(where)
  ])
  return paged(rows.map(adminView), total, filters.page, filters.pageSize)
}

export async function getUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!user) throw notFound('Member')
  const activeSessions = await db
    .select({ id: sessions.id, platform: sessions.platform, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt), sql`${sessions.expiresAt} > now()`))
  return { user: adminView(user), sessions: activeSessions }
}

export async function applyAdminAction(actor: User, id: string, input: z.infer<typeof adminActionSchema>) {
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!target || target.status === 'deleted') throw notFound('Member')
  if (target.id === actor.id) throw conflict('SELF_ACTION', 'You cannot perform this action on your own account.')
  if (target.staffRole) throw conflict('STAFF_ACCOUNT', 'Manage staff accounts from Staff and access.')
  switch (input.action) {
    case 'suspend':
      await db.update(users).set({ status: 'suspended', statusReason: input.reason }).where(eq(users.id, id))
      await logoutEverywhere(id)
      break
    case 'reactivate':
      await db.update(users).set({ status: 'active', statusReason: null, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, id))
      break
    case 'revoke-sessions':
      await logoutEverywhere(id)
      break
    case 'verify-email':
      await db.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, id))
      break
    case 'set-role':
      await db.update(users).set({ role: input.role }).where(eq(users.id, id))
      break
  }
  return getUser(id)
}

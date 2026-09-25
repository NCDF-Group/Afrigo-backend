import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { auditEvents, users, type User } from '../../db/schema.js'
import { conflict, notFound } from '../../lib/errors.js'
import { paged } from '../../lib/pagination.js'
import type { StaffRole } from '../../lib/roles.js'
import { sendStaffInviteEmail } from '../auth/auth.emails.js'
import { createToken, findUserByEmail, logoutEverywhere, publicUser } from '../auth/auth.service.js'

const ROLE_NAMES: Record<StaffRole, string> = {
  support_agent: 'Support agent',
  dispute_officer: 'Dispute officer',
  finance_operator: 'Finance operator',
  risk_officer: 'Risk officer',
  admin: 'Administrator',
  super_admin: 'Super administrator'
}

const staffView = (user: User) => ({ ...publicUser(user), invitePending: !user.passwordHash && !user.googleId, lastLoginAt: user.lastLoginAt })

export async function listStaff() {
  const rows = await db.select().from(users).where(isNotNull(users.staffRole)).orderBy(desc(users.createdAt))
  return rows.map(staffView)
}

async function superAdminCount() {
  const [{ total }] = await db.select({ total: count() }).from(users).where(and(eq(users.staffRole, 'super_admin'), eq(users.status, 'active')))
  return total
}

export async function inviteStaff(input: { email: string; firstName: string; lastName: string; role: StaffRole }) {
  let user = await findUserByEmail(input.email)
  if (user?.status === 'deleted') throw conflict('ACCOUNT_DELETED', 'This account was deleted and cannot be given staff access.')
  if (user?.staffRole) throw conflict('ALREADY_STAFF', 'This person already has staff access. Change their role instead.')
  if (user) {
    ;[user] = await db
      .update(users)
      .set({ staffRole: input.role, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, user.id))
      .returning()
  } else {
    ;[user] = await db.insert(users).values({ email: input.email, firstName: input.firstName, lastName: input.lastName, staffRole: input.role, platform: 'admin' }).returning()
  }
  if (!user.passwordHash) {
    const token = await createToken(user.id, 'staff_invite', 72 * 3_600_000)
    await sendStaffInviteEmail(user.email, user.firstName, ROLE_NAMES[input.role], token)
  }
  return staffView(user)
}

export async function changeStaffRole(actor: User, id: string, role: StaffRole | null) {
  const [target] = await db.select().from(users).where(and(eq(users.id, id), isNotNull(users.staffRole))).limit(1)
  if (!target) throw notFound('Staff member')
  if (target.id === actor.id) throw conflict('SELF_ACTION', 'You cannot change your own staff access.')
  if (target.staffRole === 'super_admin' && role !== 'super_admin' && (await superAdminCount()) <= 1) throw conflict('LAST_OWNER', 'AfriGoOS must keep at least one super administrator.')
  const [updated] = await db.update(users).set({ staffRole: role }).where(eq(users.id, id)).returning()
  await logoutEverywhere(id)
  return staffView(updated)
}

export async function resetStaffMfa(actor: User, id: string) {
  const [target] = await db.select().from(users).where(and(eq(users.id, id), isNotNull(users.staffRole))).limit(1)
  if (!target) throw notFound('Staff member')
  if (target.id === actor.id) throw conflict('SELF_ACTION', 'You cannot reset your own two step verification.')
  await db.update(users).set({ mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaRecoveryCodes: [] }).where(eq(users.id, id))
  await logoutEverywhere(id)
}

export async function listAudit(page: number, pageSize: number, action?: string) {
  const where = action ? sql`${auditEvents.action} like ${`${action.replace(/[%_]/g, '')}%`}` : undefined
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ event: auditEvents, actorEmail: users.email })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorId))
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(auditEvents).where(where)
  ])
  return paged(
    rows.map(row => ({ ...row.event, actorEmail: row.actorEmail })),
    total,
    page,
    pageSize
  )
}

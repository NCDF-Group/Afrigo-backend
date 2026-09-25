import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import { authTokens, sessions, users, type User } from '../../db/schema.js'
import { AppError, conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js'
import { hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto.js'
import { signAccessToken } from '../../lib/jwt.js'
import { capabilitiesOf, type Platform } from '../../lib/roles.js'
import { sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from './auth.emails.js'

export type ClientContext = { platform?: Platform; appVersion?: string; userAgent?: string; ipAddress?: string }

type TokenPurpose = (typeof authTokens.$inferInsert)['purpose']

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15
const HOUR = 3_600_000
const DUMMY_HASH = await hashPassword(randomToken())
const google = new OAuth2Client()

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`.trim(),
    phone: user.phone,
    country: user.country,
    avatarUrl: user.avatarUrl,
    role: user.role,
    staffRole: user.staffRole,
    capabilities: user.staffRole ? capabilitiesOf(user.staffRole) : [],
    hasPassword: Boolean(user.passwordHash),
    status: user.status,
    createdAt: user.createdAt
  }
}

async function issueSession(user: User, context: ClientContext, familyId: string = crypto.randomUUID()) {
  const refreshToken = randomToken(48)
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * HOUR)
  const [session] = await db
    .insert(sessions)
    .values({ userId: user.id, familyId, refreshTokenHash: sha256(refreshToken), platform: context.platform, userAgent: context.userAgent?.slice(0, 300), ipAddress: context.ipAddress, expiresAt })
    .returning({ id: sessions.id })
  const accessToken = await signAccessToken({ sub: user.id, sid: session.id, tv: user.tokenVersion })
  return { accessToken, accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60, refreshToken, refreshTokenExpiresAt: expiresAt.toISOString(), tokenType: 'Bearer' as const }
}

async function recordLogin(user: User, context: ClientContext) {
  const tracked = context.platform && context.platform !== 'admin'
  const [updated] = await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastActiveAt: new Date(), ...(tracked ? { platform: context.platform, appVersion: context.appVersion ?? null } : {}) })
    .where(eq(users.id, user.id))
    .returning()
  return updated
}

function assertCanSignIn(user: User, context: ClientContext) {
  if (user.status !== 'active') throw forbidden('ACCOUNT_SUSPENDED', 'This account has been suspended. Contact Afrigo support.')
  if (context.platform === 'admin' && !user.staffRole) throw forbidden('STAFF_ONLY', 'This account does not have access to Afrigo Admin.')
}

async function createToken(userId: string, purpose: TokenPurpose, ttlMs: number) {
  const token = randomToken()
  await db.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)))
  await db.insert(authTokens).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) })
  return token
}

async function consumeToken(token: string, purposes: TokenPurpose[]) {
  const [record] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha256(token)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date()), inArray(authTokens.purpose, purposes)))
    .returning()
  if (!record) throw new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Request a new one.')
  return record
}

export const findUserByEmail = async (email: string) => (await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1))[0]

export async function createEmailVerification(user: User) {
  if (user.emailVerifiedAt) return
  const token = await createToken(user.id, 'email_verification', 24 * HOUR)
  await sendVerificationEmail(user.email, user.firstName, token)
}

export async function register(input: { firstName: string; lastName: string; email: string; password: string; phone?: string; country?: string; platform?: Platform }, context: ClientContext) {
  const platform = input.platform ?? context.platform
  if (platform === 'admin') throw forbidden('STAFF_ONLY', 'Afrigo Admin accounts are created by invitation.')
  if (await findUserByEmail(input.email)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.')
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      country: input.country,
      platform,
      appVersion: context.appVersion,
      lastLoginAt: new Date(),
      lastActiveAt: new Date()
    })
    .returning()
  await createEmailVerification(user)
  const tokens = await issueSession(user, { ...context, platform })
  return { user: publicUser(user), tokens }
}

export async function login(input: { email: string; password: string; platform?: Platform }, context: ClientContext) {
  const ctx = { ...context, platform: input.platform ?? context.platform }
  const user = await findUserByEmail(input.email)
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'} or reset your password.`)
  }
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) {
    if (user) {
      const failed = user.failedLoginCount + 1
      await db
        .update(users)
        .set({ failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed, lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, user.id))
    }
    throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }
  assertCanSignIn(user, ctx)
  const updated = await recordLogin(user, ctx)
  return { user: publicUser(updated), tokens: await issueSession(updated, ctx) }
}

export async function loginWithGoogle(input: { idToken: string; platform?: Platform }, context: ClientContext) {
  if (!env.GOOGLE_CLIENT_IDS.length) throw new AppError(503, 'GOOGLE_SIGN_IN_UNAVAILABLE', 'Google sign in is not available. Use your email and password.')
  const ctx = { ...context, platform: input.platform ?? context.platform }
  let payload
  try {
    payload = (await google.verifyIdToken({ idToken: input.idToken, audience: env.GOOGLE_CLIENT_IDS })).getPayload()
  } catch {
    throw unauthorized('INVALID_GOOGLE_TOKEN', 'Google sign in failed. Please try again.')
  }
  if (!payload?.sub || !payload.email || !payload.email_verified) throw unauthorized('INVALID_GOOGLE_TOKEN', 'Your Google account email is not verified.')
  let user = (await db.select().from(users).where(eq(users.googleId, payload.sub)).limit(1))[0] ?? (await findUserByEmail(payload.email))
  if (user && user.googleId && user.googleId !== payload.sub) throw conflict('GOOGLE_ACCOUNT_MISMATCH', 'This email is linked to a different Google account.')
  if (user) {
    ;[user] = await db
      .update(users)
      .set({ googleId: payload.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date(), avatarUrl: user.avatarUrl ?? payload.picture ?? null })
      .where(eq(users.id, user.id))
      .returning()
  } else {
    if (ctx.platform === 'admin') throw forbidden('STAFF_ONLY', 'This account does not have access to Afrigo Admin.')
    ;[user] = await db
      .insert(users)
      .values({
        email: payload.email.toLowerCase(),
        googleId: payload.sub,
        emailVerifiedAt: new Date(),
        firstName: payload.given_name ?? payload.email.split('@')[0],
        lastName: payload.family_name ?? '',
        avatarUrl: payload.picture,
        platform: ctx.platform
      })
      .returning()
  }
  assertCanSignIn(user, ctx)
  const updated = await recordLogin(user, ctx)
  return { user: publicUser(updated), tokens: await issueSession(updated, ctx) }
}

export async function refresh(refreshToken: string, context: ClientContext) {
  const [session] = await db.select().from(sessions).where(eq(sessions.refreshTokenHash, sha256(refreshToken))).limit(1)
  if (!session) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  if (session.revokedAt) {
    if (session.rotated) await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)))
    throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  }
  if (session.expiresAt < new Date()) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
  if (!user) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  assertCanSignIn(user, { platform: session.platform ?? undefined })
  const [claimed] = await db
    .update(sessions)
    .set({ revokedAt: new Date(), rotated: true })
    .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id })
  if (!claimed) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.')
  const tokens = await issueSession(user, { ...context, platform: session.platform ?? context.platform }, session.familyId)
  return { user: publicUser(user), tokens }
}

export async function logout(refreshToken: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.refreshTokenHash, sha256(refreshToken)), isNull(sessions.revokedAt)))
}

export async function revokeCurrentSession(sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
}

export async function logoutEverywhere(userId: string) {
  await db.transaction(async tx => {
    await tx.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, userId))
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
  })
}

export async function verifyEmail(token: string) {
  const record = await consumeToken(token, ['email_verification'])
  const [user] = await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, record.userId)).returning()
  return publicUser(user)
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email)
  if (!user || user.status !== 'active') return
  const token = await createToken(user.id, 'password_reset', HOUR)
  await sendPasswordResetEmail(user.email, user.firstName, token, Boolean(user.staffRole))
}

export async function resetPassword(token: string, password: string) {
  const record = await consumeToken(token, ['password_reset', 'staff_invite'])
  const [user] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, record.userId))
    .returning()
  if (!user) throw notFound('Account')
  await logoutEverywhere(user.id)
  await sendPasswordChangedEmail(user.email, user.firstName)
  return { userId: user.id, invite: record.purpose === 'staff_invite' }
}

export async function changePassword(user: User, sessionId: string, currentPassword: string | undefined, newPassword: string) {
  if (user.passwordHash && !(await verifyPassword(currentPassword ?? '', user.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Your current password is incorrect.')
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id))
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId), isNull(sessions.revokedAt)))
  await sendPasswordChangedEmail(user.email, user.firstName)
}

export async function listSessions(userId: string, currentSessionId: string) {
  const rows = await db
    .select({ id: sessions.id, platform: sessions.platform, userAgent: sessions.userAgent, ipAddress: sessions.ipAddress, createdAt: sessions.createdAt, lastUsedAt: sessions.lastUsedAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sql`${sessions.createdAt} desc`)
  return rows.map(row => ({ ...row, current: row.id === currentSessionId }))
}

export async function revokeSession(userId: string, sessionId: string) {
  const [revoked] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id })
  if (!revoked) throw notFound('Session')
}

export { createToken }

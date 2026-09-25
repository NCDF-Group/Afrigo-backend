import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const memberRole = pgEnum('member_role', ['Buyer', 'Seller', 'Exporter'])

export const staffRole = pgEnum('staff_role', ['support_agent', 'dispute_officer', 'finance_operator', 'risk_officer', 'admin', 'super_admin'])

export const accountStatus = pgEnum('account_status', ['active', 'suspended', 'deleted'])

export const platform = pgEnum('platform', ['web', 'ios', 'android', 'admin'])

export const tokenPurpose = pgEnum('token_purpose', ['email_verification', 'password_reset', 'staff_invite'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    googleId: text('google_id'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'),
    country: text('country'),
    avatarUrl: text('avatar_url'),
    role: memberRole('role'),
    staffRole: staffRole('staff_role'),
    status: accountStatus('status').notNull().default('active'),
    statusReason: text('status_reason'),
    platform: platform('platform'),
    appVersion: text('app_version'),
    tokenVersion: integer('token_version').notNull().default(0),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    ...timestamps
  },
  table => [
    uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
    uniqueIndex('users_google_id_unique').on(table.googleId),
    index('users_role_idx').on(table.role),
    index('users_staff_role_idx').on(table.staffRole),
    index('users_country_idx').on(table.country)
  ]
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    platform: platform('platform'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rotated: boolean('rotated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('sessions_refresh_token_unique').on(table.refreshTokenHash), index('sessions_user_idx').on(table.userId), index('sessions_family_idx').on(table.familyId)]
)

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('auth_tokens_hash_unique').on(table.tokenHash), index('auth_tokens_user_purpose_idx').on(table.userId, table.purpose)]
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('audit_events_actor_idx').on(table.actorId), index('audit_events_action_idx').on(table.action), index('audit_events_created_idx').on(table.createdAt)]
)

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect

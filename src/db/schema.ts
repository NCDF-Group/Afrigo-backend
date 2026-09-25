import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const staffRole = pgEnum('staff_role', ['support_agent', 'dispute_officer', 'finance_operator', 'risk_officer', 'admin', 'super_admin'])

export const accountStatus = pgEnum('account_status', ['active', 'suspended', 'deleted'])

export const platform = pgEnum('platform', ['web', 'ios', 'android', 'admin'])

export const tokenPurpose = pgEnum('token_purpose', ['email_verification', 'password_reset', 'staff_invite'])

export const locale = pgEnum('locale', ['en', 'fr'])

export const organisationKind = pgEnum('organisation_kind', ['business', 'service_partner'])

export const organisationRole = pgEnum('organisation_role', ['administrator', 'member'])

export const verificationStatus = pgEnum('verification_status', ['unverified', 'pending', 'verified', 'rejected'])

export const organisationStatus = pgEnum('organisation_status', ['active', 'suspended'])

export const region = pgEnum('region', ['north', 'west', 'central', 'east', 'south'])

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
    locale: locale('locale').notNull().default('en'),
    staffRole: staffRole('staff_role'),
    status: accountStatus('status').notNull().default('active'),
    statusReason: text('status_reason'),
    platform: platform('platform'),
    appVersion: text('app_version'),
    tokenVersion: integer('token_version').notNull().default(0),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    mfaSecret: text('mfa_secret'),
    mfaPendingSecret: text('mfa_pending_secret'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    mfaLastStep: integer('mfa_last_step'),
    mfaRecoveryCodes: text('mfa_recovery_codes').array().notNull().default(sql`'{}'::text[]`),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    ...timestamps
  },
  table => [
    uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
    uniqueIndex('users_google_id_unique').on(table.googleId),
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

export const countries = pgTable('countries', {
  iso2: text('iso2').primaryKey(),
  name: text('name').notNull(),
  region: region('region').notNull(),
  currency: text('currency').notNull(),
  ecowas: boolean('ecowas').notNull().default(false),
  afcfta: boolean('afcfta').notNull().default(true),
  enabled: boolean('enabled').notNull().default(false),
  pilot: boolean('pilot').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
})

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: organisationKind('kind').notNull().default('business'),
    name: text('name').notNull(),
    tradingName: text('trading_name'),
    types: text('types').array().notNull().default(sql`'{}'::text[]`),
    registrationNumber: text('registration_number'),
    taxId: text('tax_id'),
    country: text('country')
      .notNull()
      .references(() => countries.iso2),
    city: text('city'),
    address: text('address'),
    description: text('description'),
    website: text('website'),
    email: text('email'),
    phone: text('phone'),
    logoUrl: text('logo_url'),
    verificationStatus: verificationStatus('verification_status').notNull().default('unverified'),
    verificationNote: text('verification_note'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    status: organisationStatus('status').notNull().default('active'),
    statusReason: text('status_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps
  },
  table => [index('organisations_country_idx').on(table.country), index('organisations_verification_idx').on(table.verificationStatus), index('organisations_kind_idx').on(table.kind)]
)

export const organisationMembers = pgTable(
  'organisation_members',
  {
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organisationRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [primaryKey({ columns: [table.organisationId, table.userId] }), index('organisation_members_user_idx').on(table.userId)]
)

export const organisationInvitations = pgTable(
  'organisation_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: organisationRole('role').notNull().default('member'),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('organisation_invitations_token_unique').on(table.tokenHash), index('organisation_invitations_org_idx').on(table.organisationId)]
)

export type User = typeof users.$inferSelect
export type Organisation = typeof organisations.$inferSelect
export type Session = typeof sessions.$inferSelect

import { and, count, desc, eq, gt, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from '../../db/client.js'
import { countries, organisationInvitations, organisationMembers, organisations, users, type Organisation, type User } from '../../db/schema.js'
import { randomToken, sha256 } from '../../lib/crypto.js'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { paged } from '../../lib/pagination.js'
import type { OrganisationRole } from '../../lib/roles.js'
import type { createOrganisationSchema, listOrganisationsSchema, updateOrganisationSchema } from './organisations.schemas.js'
import { sendOrganisationInvite, sendVerificationDecision } from './organisations.emails.js'

const INVITE_TTL = 7 * 24 * 3_600_000

export const organisationView = (organisation: Organisation) => ({
  id: organisation.id,
  kind: organisation.kind,
  name: organisation.name,
  tradingName: organisation.tradingName,
  types: organisation.types,
  registrationNumber: organisation.registrationNumber,
  taxId: organisation.taxId,
  country: organisation.country,
  city: organisation.city,
  address: organisation.address,
  description: organisation.description,
  website: organisation.website,
  email: organisation.email,
  phone: organisation.phone,
  logoUrl: organisation.logoUrl,
  verificationStatus: organisation.verificationStatus,
  verificationNote: organisation.verificationNote,
  verifiedAt: organisation.verifiedAt,
  status: organisation.status,
  createdAt: organisation.createdAt,
  updatedAt: organisation.updatedAt
})

async function assertCountryEnabled(iso2: string) {
  const [country] = await db.select().from(countries).where(eq(countries.iso2, iso2)).limit(1)
  if (!country) throw badRequest('UNKNOWN_COUNTRY', 'Choose a country from the list.')
  if (!country.enabled) throw badRequest('COUNTRY_NOT_SUPPORTED', `AfriGoOS is not open to businesses in ${country.name} yet.`)
}

export async function membershipsOf(userId: string) {
  const rows = await db
    .select({ organisation: organisations, role: organisationMembers.role })
    .from(organisationMembers)
    .innerJoin(organisations, eq(organisations.id, organisationMembers.organisationId))
    .where(eq(organisationMembers.userId, userId))
    .orderBy(organisationMembers.createdAt)
  return rows.map(row => ({ organisationId: row.organisation.id, name: row.organisation.name, kind: row.organisation.kind, verificationStatus: row.organisation.verificationStatus, status: row.organisation.status, role: row.role }))
}

export async function requireMembership(userId: string, organisationId: string, role?: OrganisationRole) {
  const [row] = await db
    .select({ organisation: organisations, role: organisationMembers.role })
    .from(organisationMembers)
    .innerJoin(organisations, eq(organisations.id, organisationMembers.organisationId))
    .where(and(eq(organisationMembers.userId, userId), eq(organisationMembers.organisationId, organisationId)))
    .limit(1)
  if (!row) throw notFound('Business')
  if (role === 'administrator' && row.role !== 'administrator') throw forbidden('ORGANISATION_ADMIN_ONLY', 'Only business administrators can do this.')
  return row
}

export async function createOrganisation(user: User, input: z.infer<typeof createOrganisationSchema>) {
  await assertCountryEnabled(input.country)
  return db.transaction(async tx => {
    const [organisation] = await tx
      .insert(organisations)
      .values({ ...input, types: [...new Set(input.types)], createdBy: user.id })
      .returning()
    await tx.insert(organisationMembers).values({ organisationId: organisation.id, userId: user.id, role: 'administrator' })
    return { organisation: organisationView(organisation), role: 'administrator' as const }
  })
}

export async function getOrganisation(userId: string, id: string) {
  const { organisation, role } = await requireMembership(userId, id)
  return { organisation: organisationView(organisation), role }
}

export async function updateOrganisation(userId: string, id: string, input: z.infer<typeof updateOrganisationSchema>) {
  const { organisation } = await requireMembership(userId, id, 'administrator')
  if (input.country && input.country !== organisation.country) await assertCountryEnabled(input.country)
  const identityChanged = ['name', 'registrationNumber', 'taxId', 'country'].some(key => key in input && input[key as keyof typeof input] !== organisation[key as keyof Organisation])
  const reset = identityChanged && organisation.verificationStatus === 'verified' ? { verificationStatus: 'unverified' as const, verifiedAt: null, verifiedBy: null } : {}
  const [updated] = await db
    .update(organisations)
    .set({ ...input, ...(input.types ? { types: [...new Set(input.types)] } : {}), ...reset })
    .where(eq(organisations.id, id))
    .returning()
  return organisationView(updated)
}

export async function submitForVerification(userId: string, id: string) {
  const { organisation } = await requireMembership(userId, id, 'administrator')
  if (organisation.verificationStatus === 'verified') throw conflict('ALREADY_VERIFIED', 'This business is already verified.')
  if (organisation.verificationStatus === 'pending') throw conflict('ALREADY_SUBMITTED', 'This business is already waiting for review.')
  if (!organisation.registrationNumber) throw badRequest('REGISTRATION_NUMBER_REQUIRED', 'Add your business registration number before submitting for verification.')
  const [updated] = await db.update(organisations).set({ verificationStatus: 'pending', verificationNote: null }).where(eq(organisations.id, id)).returning()
  return organisationView(updated)
}

export async function listMembers(userId: string, id: string) {
  await requireMembership(userId, id)
  const rows = await db
    .select({ user: users, role: organisationMembers.role, joinedAt: organisationMembers.createdAt })
    .from(organisationMembers)
    .innerJoin(users, eq(users.id, organisationMembers.userId))
    .where(eq(organisationMembers.organisationId, id))
    .orderBy(organisationMembers.createdAt)
  return rows.map(row => ({ userId: row.user.id, email: row.user.email, firstName: row.user.firstName, lastName: row.user.lastName, avatarUrl: row.user.avatarUrl, role: row.role, joinedAt: row.joinedAt }))
}

async function administratorCount(organisationId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(organisationMembers)
    .where(and(eq(organisationMembers.organisationId, organisationId), eq(organisationMembers.role, 'administrator')))
  return total
}

export async function changeMemberRole(userId: string, id: string, memberId: string, role: OrganisationRole) {
  await requireMembership(userId, id, 'administrator')
  const [member] = await db.select().from(organisationMembers).where(and(eq(organisationMembers.organisationId, id), eq(organisationMembers.userId, memberId))).limit(1)
  if (!member) throw notFound('Colleague')
  if (member.role === 'administrator' && role !== 'administrator' && (await administratorCount(id)) <= 1) throw conflict('LAST_ADMINISTRATOR', 'A business must keep at least one administrator.')
  await db.update(organisationMembers).set({ role }).where(and(eq(organisationMembers.organisationId, id), eq(organisationMembers.userId, memberId)))
  return listMembers(userId, id)
}

export async function removeMember(userId: string, id: string, memberId: string) {
  const { role } = await requireMembership(userId, id)
  if (memberId !== userId && role !== 'administrator') throw forbidden('ORGANISATION_ADMIN_ONLY', 'Only business administrators can do this.')
  const [member] = await db.select().from(organisationMembers).where(and(eq(organisationMembers.organisationId, id), eq(organisationMembers.userId, memberId))).limit(1)
  if (!member) throw notFound('Colleague')
  if (member.role === 'administrator' && (await administratorCount(id)) <= 1) throw conflict('LAST_ADMINISTRATOR', 'A business must keep at least one administrator.')
  await db.delete(organisationMembers).where(and(eq(organisationMembers.organisationId, id), eq(organisationMembers.userId, memberId)))
}

export async function inviteColleague(inviter: User, id: string, input: { email: string; role: OrganisationRole }) {
  const { organisation } = await requireMembership(inviter.id, id, 'administrator')
  if (organisation.status !== 'active') throw forbidden('ORGANISATION_SUSPENDED', 'This business is suspended.')
  const [existing] = await db
    .select({ userId: users.id })
    .from(organisationMembers)
    .innerJoin(users, eq(users.id, organisationMembers.userId))
    .where(and(eq(organisationMembers.organisationId, id), sql`lower(${users.email}) = ${input.email}`))
    .limit(1)
  if (existing) throw conflict('ALREADY_MEMBER', 'This person is already part of the business.')
  const token = randomToken()
  const [invitation] = await db.transaction(async tx => {
    await tx
      .update(organisationInvitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(organisationInvitations.organisationId, id), sql`lower(${organisationInvitations.email}) = ${input.email}`, isNull(organisationInvitations.acceptedAt), isNull(organisationInvitations.revokedAt)))
    return tx
      .insert(organisationInvitations)
      .values({ organisationId: id, email: input.email, role: input.role, tokenHash: sha256(token), invitedBy: inviter.id, expiresAt: new Date(Date.now() + INVITE_TTL) })
      .returning()
  })
  await sendOrganisationInvite(input.email, organisation.name, `${inviter.firstName} ${inviter.lastName}`.trim(), token)
  return { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }
}

export async function listInvitations(userId: string, id: string) {
  await requireMembership(userId, id, 'administrator')
  return db
    .select({ id: organisationInvitations.id, email: organisationInvitations.email, role: organisationInvitations.role, expiresAt: organisationInvitations.expiresAt, createdAt: organisationInvitations.createdAt })
    .from(organisationInvitations)
    .where(and(eq(organisationInvitations.organisationId, id), isNull(organisationInvitations.acceptedAt), isNull(organisationInvitations.revokedAt), gt(organisationInvitations.expiresAt, new Date())))
    .orderBy(desc(organisationInvitations.createdAt))
}

export async function revokeInvitation(userId: string, id: string, invitationId: string) {
  await requireMembership(userId, id, 'administrator')
  const [revoked] = await db
    .update(organisationInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(organisationInvitations.id, invitationId), eq(organisationInvitations.organisationId, id), isNull(organisationInvitations.acceptedAt), isNull(organisationInvitations.revokedAt)))
    .returning({ id: organisationInvitations.id })
  if (!revoked) throw notFound('Invitation')
}

export async function acceptInvitation(user: User, token: string) {
  const [invitation] = await db
    .select()
    .from(organisationInvitations)
    .where(and(eq(organisationInvitations.tokenHash, sha256(token)), isNull(organisationInvitations.acceptedAt), isNull(organisationInvitations.revokedAt), gt(organisationInvitations.expiresAt, new Date())))
    .limit(1)
  if (!invitation) throw new AppError(400, 'INVALID_TOKEN', 'This invitation is invalid or has expired. Ask for a new one.')
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) throw forbidden('INVITATION_EMAIL_MISMATCH', `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.`)
  await db.transaction(async tx => {
    await tx.update(organisationInvitations).set({ acceptedAt: new Date() }).where(eq(organisationInvitations.id, invitation.id))
    await tx.insert(organisationMembers).values({ organisationId: invitation.organisationId, userId: user.id, role: invitation.role }).onConflictDoNothing()
  })
  return getOrganisation(user.id, invitation.organisationId)
}

export async function listOrganisations(filters: z.infer<typeof listOrganisationsSchema>) {
  const conditions: SQL[] = []
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, '')}%`
    conditions.push(or(ilike(organisations.name, term), ilike(organisations.tradingName, term), ilike(organisations.registrationNumber, term))!)
  }
  if (filters.kind) conditions.push(eq(organisations.kind, filters.kind))
  if (filters.country) conditions.push(eq(organisations.country, filters.country))
  if (filters.verificationStatus) conditions.push(eq(organisations.verificationStatus, filters.verificationStatus))
  if (filters.status) conditions.push(eq(organisations.status, filters.status))
  const where = conditions.length ? and(...conditions) : undefined
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ organisation: organisations, members: sql<number>`(select count(*)::int from ${organisationMembers} where ${organisationMembers.organisationId} = ${organisations.id})` })
      .from(organisations)
      .where(where)
      .orderBy(desc(organisations.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(organisations).where(where)
  ])
  return paged(
    rows.map(row => ({ ...organisationView(row.organisation), memberCount: row.members })),
    total,
    filters.page,
    filters.pageSize
  )
}

export async function getOrganisationForAdmin(id: string) {
  const [organisation] = await db.select().from(organisations).where(eq(organisations.id, id)).limit(1)
  if (!organisation) throw notFound('Business')
  const members = await db
    .select({ userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: organisationMembers.role, status: users.status })
    .from(organisationMembers)
    .innerJoin(users, eq(users.id, organisationMembers.userId))
    .where(eq(organisationMembers.organisationId, id))
  return { organisation: organisationView(organisation), members }
}

export async function reviewOrganisation(reviewer: User, id: string, decision: 'verify' | 'reject', note?: string) {
  const [organisation] = await db.select().from(organisations).where(eq(organisations.id, id)).limit(1)
  if (!organisation) throw notFound('Business')
  const verified = decision === 'verify'
  await db
    .update(organisations)
    .set({ verificationStatus: verified ? 'verified' : 'rejected', verificationNote: note ?? null, verifiedAt: verified ? new Date() : null, verifiedBy: verified ? reviewer.id : null })
    .where(eq(organisations.id, id))
  const administrators = await db
    .select({ email: users.email })
    .from(organisationMembers)
    .innerJoin(users, eq(users.id, organisationMembers.userId))
    .where(and(eq(organisationMembers.organisationId, id), eq(organisationMembers.role, 'administrator')))
  await Promise.all(administrators.map(admin => sendVerificationDecision(admin.email, organisation.name, verified, note)))
  return getOrganisationForAdmin(id)
}

export async function setOrganisationStatus(id: string, input: { action: 'suspend'; reason: string } | { action: 'reactivate' }) {
  const [updated] = await db
    .update(organisations)
    .set(input.action === 'suspend' ? { status: 'suspended', statusReason: input.reason } : { status: 'active', statusReason: null })
    .where(eq(organisations.id, id))
    .returning({ id: organisations.id })
  if (!updated) throw notFound('Business')
  return getOrganisationForAdmin(id)
}

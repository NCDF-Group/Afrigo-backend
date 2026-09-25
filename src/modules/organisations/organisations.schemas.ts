import { z } from 'zod'
import { pageSchema } from '../../lib/pagination.js'
import { ORGANISATION_KINDS, ORGANISATION_ROLES, ORGANISATION_TYPES } from '../../lib/roles.js'
import { email } from '../auth/auth.schemas.js'

const text = (max: number) => z.string().trim().max(max)
const nullableText = (max: number) => text(max).nullable().optional()

const profile = {
  name: text(160).min(2, 'Enter the registered business name.'),
  tradingName: nullableText(160),
  types: z.array(z.enum(ORGANISATION_TYPES)).min(1, 'Choose at least one business type.').max(ORGANISATION_TYPES.length),
  registrationNumber: nullableText(80),
  taxId: nullableText(80),
  country: z.string().trim().length(2, 'Use a two letter country code.').toLowerCase(),
  city: nullableText(120),
  address: nullableText(300),
  description: nullableText(2000),
  website: z.url().max(300).nullable().optional(),
  email: email.nullable().optional(),
  phone: nullableText(32),
  logoUrl: z.url().max(500).nullable().optional()
}

export const createOrganisationSchema = z.object({ ...profile, kind: z.enum(ORGANISATION_KINDS).default('business') })

export const updateOrganisationSchema = z
  .object(profile)
  .partial()
  .refine(value => Object.keys(value).length > 0, 'Send at least one field to update.')

export const inviteSchema = z.object({ email, role: z.enum(ORGANISATION_ROLES).default('member') })

export const memberRoleSchema = z.object({ role: z.enum(ORGANISATION_ROLES) })

export const acceptSchema = z.object({ token: z.string().min(20).max(512) })

export const organisationParams = z.object({ id: z.uuid('Invalid id.') })

export const memberParams = z.object({ id: z.uuid('Invalid id.'), userId: z.uuid('Invalid id.') })

export const invitationParams = z.object({ id: z.uuid('Invalid id.'), invitationId: z.uuid('Invalid id.') })

export const listOrganisationsSchema = pageSchema.extend({
  q: z.string().trim().max(120).optional(),
  kind: z.enum(ORGANISATION_KINDS).optional(),
  country: z.string().trim().length(2).toLowerCase().optional(),
  verificationStatus: z.enum(['unverified', 'pending', 'verified', 'rejected']).optional(),
  status: z.enum(['active', 'suspended']).optional()
})

export const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('verify'), note: z.string().trim().max(1000).optional() }),
  z.object({ decision: z.literal('reject'), note: z.string().trim().min(3, 'Tell the business what to fix.').max(1000) })
])

export const statusSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3, 'Add a reason.').max(500) }),
  z.object({ action: z.literal('reactivate') })
])

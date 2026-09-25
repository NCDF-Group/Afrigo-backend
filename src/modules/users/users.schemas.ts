import { z } from 'zod'
import { MEMBER_ROLES } from '../../lib/roles.js'
import { pageSchema } from '../../lib/pagination.js'

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(32).nullable(),
    country: z.string().trim().length(2).toLowerCase().nullable(),
    avatarUrl: z.url().max(500).nullable()
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, 'Send at least one field to update.')

export const roleSchema = z.object({ role: z.enum(MEMBER_ROLES) })

export const deleteAccountSchema = z.object({ password: z.string().max(128).optional(), confirm: z.literal('DELETE', { error: 'Type DELETE to confirm.' }) })

export const listUsersSchema = pageSchema.extend({
  q: z.string().trim().max(120).optional(),
  role: z.enum(MEMBER_ROLES).optional(),
  country: z.string().trim().length(2).toLowerCase().optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
  verified: z.enum(['true', 'false']).optional()
})

export const adminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3, 'Add a reason.').max(500) }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('revoke-sessions') }),
  z.object({ action: z.literal('verify-email') }),
  z.object({ action: z.literal('set-role'), role: z.enum(MEMBER_ROLES) })
])

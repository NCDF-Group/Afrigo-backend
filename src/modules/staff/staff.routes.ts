import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { idSchema, pageSchema } from '../../lib/pagination.js'
import { STAFF_ROLES } from '../../lib/roles.js'
import { parse } from '../../lib/validate.js'
import { requireStaff } from '../../middleware/authenticate.js'
import { email } from '../auth/auth.schemas.js'
import * as staff from './staff.service.js'

const inviteSchema = z.object({ email, firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), role: z.enum(STAFF_ROLES) })
const roleSchema = z.object({ role: z.enum(STAFF_ROLES).nullable() })
const auditQuery = pageSchema.extend({ action: z.string().trim().max(80).optional() })

export const staffRouter = Router()

staffRouter.get('/', requireStaff('staff:manage'), async (_request, response) => {
  response.json({ items: await staff.listStaff() })
})

staffRouter.post('/', requireStaff('staff:manage'), async (request, response) => {
  const input = parse(inviteSchema, request.body)
  const member = await staff.inviteStaff(input)
  await audit({ actorId: request.auth!.user.id, action: 'admin.staff.invite', targetType: 'user', targetId: member.id, metadata: { email: input.email, role: input.role }, request })
  response.status(201).json({ staff: member })
})

staffRouter.patch('/:id', requireStaff('staff:manage'), async (request, response) => {
  const { id } = parse(idSchema, request.params)
  const { role } = parse(roleSchema, request.body)
  const member = await staff.changeStaffRole(request.auth!.user, id, role)
  await audit({ actorId: request.auth!.user.id, action: role ? 'admin.staff.role_changed' : 'admin.staff.revoked', targetType: 'user', targetId: id, metadata: { role }, request })
  response.json({ staff: member })
})

staffRouter.post('/:id/reset-mfa', requireStaff('staff:manage'), async (request, response) => {
  const { id } = parse(idSchema, request.params)
  await staff.resetStaffMfa(request.auth!.user, id)
  await audit({ actorId: request.auth!.user.id, action: 'admin.staff.mfa_reset', targetType: 'user', targetId: id, request })
  response.status(204).end()
})

export const auditRouter = Router()

auditRouter.get('/', requireStaff('staff:manage'), async (request, response) => {
  const { page, pageSize, action } = parse(auditQuery, request.query)
  response.json(await staff.listAudit(page, pageSize, action))
})

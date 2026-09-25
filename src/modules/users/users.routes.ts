import { Router } from 'express'
import { audit } from '../../lib/audit.js'
import { idSchema } from '../../lib/pagination.js'
import { parse } from '../../lib/validate.js'
import { requireAuth, requireStaff } from '../../middleware/authenticate.js'
import { sensitiveLimiter } from '../../middleware/rate-limit.js'
import { adminActionSchema, deleteAccountSchema, listUsersSchema, updateProfileSchema } from './users.schemas.js'
import * as usersService from './users.service.js'

export const usersRouter = Router()

usersRouter.patch('/me', requireAuth, async (request, response) => {
  const input = parse(updateProfileSchema, request.body)
  response.json({ user: await usersService.updateProfile(request.auth!.user, input) })
})

usersRouter.delete('/me', sensitiveLimiter, requireAuth, async (request, response) => {
  const { password } = parse(deleteAccountSchema, request.body)
  const id = request.auth!.user.id
  await usersService.deleteAccount(request.auth!.user, password)
  await audit({ actorId: id, action: 'user.deleted_self', targetType: 'user', targetId: id, request })
  response.status(204).end()
})

export const adminUsersRouter = Router()

adminUsersRouter.get('/', requireStaff('users:read'), async (request, response) => {
  response.json(await usersService.listUsers(parse(listUsersSchema, request.query)))
})

adminUsersRouter.get('/:id', requireStaff('users:read'), async (request, response) => {
  const { id } = parse(idSchema, request.params)
  response.json(await usersService.getUser(id))
})

adminUsersRouter.post('/:id/actions', requireStaff('users:manage'), async (request, response) => {
  const { id } = parse(idSchema, request.params)
  const input = parse(adminActionSchema, request.body)
  const result = await usersService.applyAdminAction(request.auth!.user, id, input)
  await audit({ actorId: request.auth!.user.id, action: `admin.user.${input.action}`, targetType: 'user', targetId: id, metadata: input, request })
  response.json(result)
})

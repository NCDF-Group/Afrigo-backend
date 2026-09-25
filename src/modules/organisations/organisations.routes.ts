import { Router } from 'express'
import { audit } from '../../lib/audit.js'
import { parse } from '../../lib/validate.js'
import { requireAuth, requireStaff } from '../../middleware/authenticate.js'
import {
  acceptSchema,
  createOrganisationSchema,
  invitationParams,
  inviteSchema,
  listOrganisationsSchema,
  memberParams,
  memberRoleSchema,
  organisationParams,
  reviewSchema,
  statusSchema,
  updateOrganisationSchema
} from './organisations.schemas.js'
import * as service from './organisations.service.js'

export const organisationsRouter = Router()

organisationsRouter.use(requireAuth)

organisationsRouter.post('/', async (request, response) => {
  const input = parse(createOrganisationSchema, request.body)
  const result = await service.createOrganisation(request.auth!.user, input)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.created', targetType: 'organisation', targetId: result.organisation.id, metadata: { kind: input.kind }, request })
  response.status(201).json(result)
})

organisationsRouter.get('/mine', async (request, response) => {
  response.json({ items: await service.membershipsOf(request.auth!.user.id) })
})

organisationsRouter.post('/invitations/accept', async (request, response) => {
  const { token } = parse(acceptSchema, request.body)
  const result = await service.acceptInvitation(request.auth!.user, token)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.invitation_accepted', targetType: 'organisation', targetId: result.organisation.id, request })
  response.json(result)
})

organisationsRouter.get('/:id', async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  response.json(await service.getOrganisation(request.auth!.user.id, id))
})

organisationsRouter.patch('/:id', async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  const input = parse(updateOrganisationSchema, request.body)
  const organisation = await service.updateOrganisation(request.auth!.user.id, id, input)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.updated', targetType: 'organisation', targetId: id, metadata: { fields: Object.keys(input) }, request })
  response.json({ organisation })
})

organisationsRouter.post('/:id/verification', async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  const organisation = await service.submitForVerification(request.auth!.user.id, id)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.verification_requested', targetType: 'organisation', targetId: id, request })
  response.json({ organisation })
})

organisationsRouter.get('/:id/members', async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  response.json({ items: await service.listMembers(request.auth!.user.id, id) })
})

organisationsRouter.patch('/:id/members/:userId', async (request, response) => {
  const { id, userId } = parse(memberParams, request.params)
  const { role } = parse(memberRoleSchema, request.body)
  const items = await service.changeMemberRole(request.auth!.user.id, id, userId, role)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.member_role_changed', targetType: 'organisation', targetId: id, metadata: { userId, role }, request })
  response.json({ items })
})

organisationsRouter.delete('/:id/members/:userId', async (request, response) => {
  const { id, userId } = parse(memberParams, request.params)
  await service.removeMember(request.auth!.user.id, id, userId)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.member_removed', targetType: 'organisation', targetId: id, metadata: { userId }, request })
  response.status(204).end()
})

organisationsRouter.get('/:id/invitations', async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  response.json({ items: await service.listInvitations(request.auth!.user.id, id) })
})

organisationsRouter.post('/:id/invitations', async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  const input = parse(inviteSchema, request.body)
  const invitation = await service.inviteColleague(request.auth!.user, id, input)
  await audit({ actorId: request.auth!.user.id, action: 'organisation.colleague_invited', targetType: 'organisation', targetId: id, metadata: { email: input.email, role: input.role }, request })
  response.status(201).json({ invitation })
})

organisationsRouter.delete('/:id/invitations/:invitationId', async (request, response) => {
  const { id, invitationId } = parse(invitationParams, request.params)
  await service.revokeInvitation(request.auth!.user.id, id, invitationId)
  response.status(204).end()
})

export const adminOrganisationsRouter = Router()

adminOrganisationsRouter.get('/', requireStaff('risk:read'), async (request, response) => {
  response.json(await service.listOrganisations(parse(listOrganisationsSchema, request.query)))
})

adminOrganisationsRouter.get('/:id', requireStaff('risk:read'), async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  response.json(await service.getOrganisationForAdmin(id))
})

adminOrganisationsRouter.post('/:id/review', requireStaff('compliance:review'), async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  const input = parse(reviewSchema, request.body)
  const result = await service.reviewOrganisation(request.auth!.user, id, input.decision, input.note)
  await audit({ actorId: request.auth!.user.id, action: `admin.organisation.${input.decision}`, targetType: 'organisation', targetId: id, metadata: { note: input.note ?? null }, request })
  response.json(result)
})

adminOrganisationsRouter.post('/:id/status', requireStaff('users:manage'), async (request, response) => {
  const { id } = parse(organisationParams, request.params)
  const input = parse(statusSchema, request.body)
  const result = await service.setOrganisationStatus(id, input)
  await audit({ actorId: request.auth!.user.id, action: `admin.organisation.${input.action}`, targetType: 'organisation', targetId: id, metadata: input, request })
  response.json(result)
})

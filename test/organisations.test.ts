import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer, business, createStaff, lastEmailToken, register, reset, sql } from './helpers.js'

beforeEach(reset)
afterAll(() => sql.end())

async function owner() {
  const { tokens } = await register('ada@example.com')
  const created = await api().post('/api/v1/organisations').set(bearer(tokens.accessToken)).send(business)
  return { token: tokens.accessToken, organisationId: created.body.organisation.id as string, created }
}

describe('business profiles', () => {
  it('creates a business with the creator as administrator', async () => {
    const { created, token } = await owner()
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ role: 'administrator', organisation: { name: 'Okafor Agro Ltd', types: ['exporter', 'aggregator'], country: 'ng', verificationStatus: 'unverified' } })
    const me = await api().get('/api/v1/auth/me').set(bearer(token))
    expect(me.body.organisations).toEqual([expect.objectContaining({ name: 'Okafor Agro Ltd', role: 'administrator' })])
  })

  it('only accepts businesses in enabled countries', async () => {
    const { tokens } = await register()
    const response = await api().post('/api/v1/organisations').set(bearer(tokens.accessToken)).send({ ...business, country: 'KE' })
    expect(response.body.error.code).toBe('COUNTRY_NOT_SUPPORTED')
  })

  it('hides a business from people outside it', async () => {
    const { organisationId } = await owner()
    const stranger = await register('stranger@example.com')
    expect((await api().get(`/api/v1/organisations/${organisationId}`).set(bearer(stranger.tokens.accessToken))).status).toBe(404)
  })

  it('submits for verification and an administrator reviews it', async () => {
    const { organisationId, token } = await owner()
    const submitted = await api().post(`/api/v1/organisations/${organisationId}/verification`).set(bearer(token))
    expect(submitted.body.organisation.verificationStatus).toBe('pending')
    const risk = await createStaff('risk@afrigo.africa', 'risk_officer')
    const queue = await api().get('/api/v1/admin/organisations?verificationStatus=pending').set(bearer(risk.tokens.accessToken))
    expect(queue.body.total).toBe(1)
    const review = await api().post(`/api/v1/admin/organisations/${organisationId}/review`).set(bearer(risk.tokens.accessToken)).send({ decision: 'verify' })
    expect(review.body.organisation.verificationStatus).toBe('verified')
    const renamed = await api().patch(`/api/v1/organisations/${organisationId}`).set(bearer(token)).send({ name: 'Okafor Agro Holdings' })
    expect(renamed.body.organisation.verificationStatus).toBe('unverified')
  })
})

describe('colleagues', () => {
  it('invites a colleague who joins as a team member', async () => {
    const { organisationId, token } = await owner()
    const invite = await api().post(`/api/v1/organisations/${organisationId}/invitations`).set(bearer(token)).send({ email: 'kofi@example.com' })
    expect(invite.status).toBe(201)
    const inviteToken = lastEmailToken('kofi@example.com')
    const colleague = await register('kofi@example.com')
    const accepted = await api().post('/api/v1/organisations/invitations/accept').set(bearer(colleague.tokens.accessToken)).send({ token: inviteToken })
    expect(accepted.body.role).toBe('member')
    const members = await api().get(`/api/v1/organisations/${organisationId}/members`).set(bearer(colleague.tokens.accessToken))
    expect(members.body.items).toHaveLength(2)
    const blocked = await api().patch(`/api/v1/organisations/${organisationId}`).set(bearer(colleague.tokens.accessToken)).send({ city: 'Abuja' })
    expect(blocked.body.error.code).toBe('ORGANISATION_ADMIN_ONLY')
  })

  it('refuses an invitation opened by a different account', async () => {
    const { organisationId, token } = await owner()
    await api().post(`/api/v1/organisations/${organisationId}/invitations`).set(bearer(token)).send({ email: 'kofi@example.com' })
    const other = await register('someone@example.com')
    const response = await api().post('/api/v1/organisations/invitations/accept').set(bearer(other.tokens.accessToken)).send({ token: lastEmailToken('kofi@example.com') })
    expect(response.body.error.code).toBe('INVITATION_EMAIL_MISMATCH')
  })

  it('always keeps one administrator', async () => {
    const { organisationId, token } = await owner()
    const me = await api().get('/api/v1/auth/me').set(bearer(token))
    const response = await api().delete(`/api/v1/organisations/${organisationId}/members/${me.body.user.id}`).set(bearer(token))
    expect(response.body.error.code).toBe('LAST_ADMINISTRATOR')
    const deletion = await api().delete('/api/v1/users/me').set(bearer(token)).send({ password: 'Password123', confirm: 'DELETE' })
    expect(deletion.body.error.code).toBe('LAST_ADMINISTRATOR')
  })

  it('lets a service partner be created', async () => {
    const { tokens } = await register('partner@example.com')
    const response = await api().post('/api/v1/organisations').set(bearer(tokens.accessToken)).send({ ...business, name: 'Coastal Inspection Ltd', kind: 'service_partner', types: ['trade_service_provider'] })
    expect(response.body.organisation.kind).toBe('service_partner')
  })
})

describe('configuration', () => {
  it('lists countries publicly and lets administrators open a market', async () => {
    const list = await api().get('/api/v1/config/countries?enabled=true')
    expect(list.body.items.map((item: { iso2: string }) => item.iso2)).toContain('ng')
    const admin = await createStaff('admin@afrigo.africa', 'admin')
    const opened = await api().patch('/api/v1/admin/config/countries/ke').set(bearer(admin.tokens.accessToken)).send({ enabled: true })
    expect(opened.body.country.enabled).toBe(true)
  })
})

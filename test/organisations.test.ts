import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer, business, createStaff, lastEmailToken, register, reset, sql } from './helpers.js'

beforeEach(reset)
afterAll(() => sql.end())

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 32)])

function upload(organisationId: string, token: string, content = PDF, type = 'application/pdf') {
  return api()
    .post(`/api/v1/organisations/${organisationId}/documents?kind=registration_certificate&fileName=cac.pdf`)
    .set(bearer(token))
    .set('Content-Type', type)
    .send(content)
}

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

  it('gives a member without a country the country of their first business', async () => {
    const response = await api().post('/api/v1/auth/register').send({ firstName: 'Kwame', lastName: 'Mensah', email: 'kwame@example.com', password: 'Password123', platform: 'web' })
    const token = response.body.tokens.accessToken
    expect(response.body.user.country).toBeNull()
    await api().post('/api/v1/organisations').set(bearer(token)).send({ ...business, country: 'GH' })
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).body.user.country).toBe('gh')
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
    const empty = await api().post(`/api/v1/organisations/${organisationId}/verification`).set(bearer(token))
    expect(empty.body.error.code).toBe('DOCUMENTS_REQUIRED')
    await upload(organisationId, token)
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

describe('documents', () => {
  it('uploads, lists and serves a document to its business', async () => {
    const { organisationId, token } = await owner()
    const uploaded = await upload(organisationId, token)
    expect(uploaded.status).toBe(201)
    expect(uploaded.body.document).toMatchObject({ kind: 'registration_certificate', fileName: 'cac.pdf', status: 'pending' })
    const list = await api().get(`/api/v1/organisations/${organisationId}/documents`).set(bearer(token))
    expect(list.body.items).toHaveLength(1)
    const file = await api().get(`/api/v1/organisations/${organisationId}/documents/${uploaded.body.document.id}/file`).set(bearer(token))
    expect(file.headers['content-type']).toContain('application/pdf')
    const stranger = await register('stranger@example.com')
    expect((await api().get(`/api/v1/organisations/${organisationId}/documents`).set(bearer(stranger.tokens.accessToken))).status).toBe(404)
  })

  it('rejects files whose content does not match their type', async () => {
    const { organisationId, token } = await owner()
    const response = await upload(organisationId, token, Buffer.from('not really a pdf file at all'))
    expect(response.status).toBe(400)
  })

  it('lets a risk officer review documents', async () => {
    const { organisationId, token } = await owner()
    const uploaded = await upload(organisationId, token)
    const risk = await createStaff('risk@afrigo.africa', 'risk_officer')
    const queue = await api().get('/api/v1/admin/documents?status=pending').set(bearer(risk.tokens.accessToken))
    expect(queue.body.items).toEqual([expect.objectContaining({ id: uploaded.body.document.id, organisationName: 'Okafor Agro Ltd' })])
    const detail = await api().get(`/api/v1/admin/organisations/${organisationId}`).set(bearer(risk.tokens.accessToken))
    expect(detail.body.documents).toHaveLength(1)
    const file = await api().get(`/api/v1/admin/documents/${uploaded.body.document.id}/file`).set(bearer(risk.tokens.accessToken))
    expect(file.status).toBe(200)
    const missingNote = await api().post(`/api/v1/admin/documents/${uploaded.body.document.id}/review`).set(bearer(risk.tokens.accessToken)).send({ decision: 'reject' })
    expect(missingNote.status).toBe(400)
    const approved = await api().post(`/api/v1/admin/documents/${uploaded.body.document.id}/review`).set(bearer(risk.tokens.accessToken)).send({ decision: 'approve' })
    expect(approved.body.document.status).toBe('approved')
  })
})

describe('admin member management', () => {
  it('removes a member from a business', async () => {
    const { organisationId, token } = await owner()
    await api().post(`/api/v1/organisations/${organisationId}/invitations`).set(bearer(token)).send({ email: 'kofi@example.com' })
    const inviteToken = lastEmailToken('kofi@example.com')
    const colleague = await register('kofi@example.com')
    await api().post('/api/v1/organisations/invitations/accept').set(bearer(colleague.tokens.accessToken)).send({ token: inviteToken })
    const risk = await createStaff('risk@afrigo.africa', 'risk_officer')
    const removed = await api().delete(`/api/v1/admin/organisations/${organisationId}/members/${colleague.user.id}`).set(bearer(risk.tokens.accessToken))
    expect(removed.status).toBe(200)
    expect(removed.body.members).toHaveLength(1)
    const support = await createStaff('support@afrigo.africa', 'support_agent')
    const blocked = await api().delete(`/api/v1/admin/organisations/${organisationId}/members/${colleague.user.id}`).set(bearer(support.tokens.accessToken))
    expect(blocked.status).toBe(403)
  })

  it('reports platform statistics', async () => {
    const { token } = await owner()
    await sql`update users set country = null`
    const me = await api().get('/api/v1/auth/me').set(bearer(token))
    expect(me.body.user.country).toBeNull()
    const support = await createStaff('support@afrigo.africa', 'support_agent')
    const stats = await api().get('/api/v1/admin/stats').set(bearer(support.tokens.accessToken))
    expect(stats.status).toBe(200)
    expect(stats.body.totals).toMatchObject({ users: 1, businesses: 1, unverifiedBusinesses: 1 })
    expect(stats.body.signups).toHaveLength(30)
    expect(stats.body.countries.find((country: { iso2: string }) => country.iso2 === 'ng')).toMatchObject({ users: 1, businesses: 1 })
  })
})

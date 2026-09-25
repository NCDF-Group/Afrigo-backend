import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer, createStaff, lastEmailToken, register, reset, sql, totp } from './helpers.js'

beforeEach(reset)
afterAll(() => sql.end())

describe('member profile', () => {
  it('updates the profile and language', async () => {
    const { tokens } = await register()
    const profile = await api().patch('/api/v1/users/me').set(bearer(tokens.accessToken)).send({ phone: '+2348000000000', country: 'GH', locale: 'fr' })
    expect(profile.body.user).toMatchObject({ phone: '+2348000000000', country: 'gh', locale: 'fr' })
  })

  it('deletes an account and anonymises it', async () => {
    const { tokens } = await register()
    const response = await api().delete('/api/v1/users/me').set('Authorization', `Bearer ${tokens.accessToken}`).send({ password: 'Password123', confirm: 'DELETE' })
    expect(response.status).toBe(204)
    expect((await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123' })).status).toBe(401)
  })
})

describe('admin member management', () => {
  it('blocks members and allows staff with the right capability', async () => {
    const { tokens } = await register()
    expect((await api().get('/api/v1/admin/users').set('Authorization', `Bearer ${tokens.accessToken}`)).status).toBe(403)
    const support = await createStaff('support@afrigo.africa', 'support_agent')
    const list = await api().get('/api/v1/admin/users?q=ada').set('Authorization', `Bearer ${support.tokens.accessToken}`)
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    const suspend = await api().post(`/api/v1/admin/users/${list.body.items[0].id}/actions`).set('Authorization', `Bearer ${support.tokens.accessToken}`).send({ action: 'suspend', reason: 'Fraud report' })
    expect(suspend.status).toBe(403)
  })

  it('suspends a member and ends their sessions', async () => {
    const member = await register()
    const risk = await createStaff('risk@afrigo.africa', 'risk_officer')
    const response = await api().post(`/api/v1/admin/users/${member.user.id}/actions`).set('Authorization', `Bearer ${risk.tokens.accessToken}`).send({ action: 'suspend', reason: 'Fraud report under review' })
    expect(response.status).toBe(200)
    expect(response.body.user.status).toBe('suspended')
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${member.tokens.accessToken}`)).status).toBe(401)
    const login = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123' })
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED')
  })
})

describe('staff access', () => {
  it('invites a new staff member who sets a password from the email link', async () => {
    const owner = await createStaff('owner@afrigo.africa', 'super_admin')
    const invite = await api().post('/api/v1/admin/staff').set('Authorization', `Bearer ${owner.tokens.accessToken}`).send({ email: 'finance@afrigo.africa', firstName: 'Kojo', lastName: 'Asante', role: 'finance_operator' })
    expect(invite.status).toBe(201)
    expect(invite.body.staff.invitePending).toBe(true)
    const token = lastEmailToken('finance@afrigo.africa')
    expect((await api().post('/api/v1/auth/password/reset').send({ token, password: 'FinancePass789' })).status).toBe(204)
    const login = await api().post('/api/v1/auth/login').send({ email: 'finance@afrigo.africa', password: 'FinancePass789', platform: 'admin' })
    expect(login.body.mfaSetupRequired).toBe(true)
    expect(login.body).not.toHaveProperty('tokens')
    const setup = await api().post('/api/v1/auth/mfa/setup').send({ mfaToken: login.body.mfaToken })
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/')
    const enabled = await api().post('/api/v1/auth/mfa/enable').send({ mfaToken: login.body.mfaToken, code: totp(setup.body.secret) })
    expect(enabled.status).toBe(200)
    expect(enabled.body.recoveryCodes).toHaveLength(10)
    expect(enabled.body.user.capabilities).toContain('payouts:execute')
    expect(enabled.body.user.mfaEnabled).toBe(true)
  })

  it('keeps at least one super administrator and records an audit trail', async () => {
    const owner = await createStaff('owner@afrigo.africa', 'super_admin')
    const admin = await createStaff('admin@afrigo.africa', 'admin')
    const self = await api().patch(`/api/v1/admin/staff/${owner.user.id}`).set('Authorization', `Bearer ${owner.tokens.accessToken}`).send({ role: null })
    expect(self.body.error.code).toBe('SELF_ACTION')
    expect((await api().patch(`/api/v1/admin/staff/${owner.user.id}`).set('Authorization', `Bearer ${admin.tokens.accessToken}`).send({ role: null })).status).toBe(403)
    const trail = await api().get('/api/v1/admin/audit').set('Authorization', `Bearer ${owner.tokens.accessToken}`)
    expect(trail.status).toBe(200)
    expect(trail.body.items.some((item: { action: string }) => item.action === 'auth.login')).toBe(true)
    expect((await api().post(`/api/v1/admin/staff/${admin.user.id}/reset-mfa`).set(bearer(owner.tokens.accessToken))).status).toBe(204)
  })
})

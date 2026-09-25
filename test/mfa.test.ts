import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { codeAt } from '../src/lib/totp.js'
import { api, bearer, createStaff, register, reset, sql, totp } from './helpers.js'

beforeEach(reset)
afterAll(() => sql.end())

describe('totp', () => {
  it('matches the RFC 6238 reference vector', () => {
    expect(codeAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082')
  })
})

describe('administrator MFA', () => {
  it('requires a code before issuing tokens and rejects reuse of the same code', async () => {
    const staff = await createStaff('owner@afrigo.africa', 'super_admin')
    const login = await api().post('/api/v1/auth/login').send({ email: 'owner@afrigo.africa', password: 'StaffPassword1', platform: 'admin' })
    expect(login.body.mfaRequired).toBe(true)
    const code = totp(staff.secret, 1)
    expect((await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: login.body.mfaToken, code })).status).toBe(200)
    const replay = await api().post('/api/v1/auth/login').send({ email: 'owner@afrigo.africa', password: 'StaffPassword1', platform: 'admin' })
    const reused = await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: replay.body.mfaToken, code })
    expect(reused.body.error.code).toBe('INVALID_MFA_CODE')
  })

  it('accepts a recovery code once', async () => {
    const staff = await createStaff('owner@afrigo.africa', 'super_admin')
    const regenerated = await api().post('/api/v1/auth/mfa/recovery-codes').set(bearer(staff.tokens.accessToken)).send({ code: totp(staff.secret, 1) })
    const [recoveryCode] = regenerated.body.recoveryCodes
    const login = async () => (await api().post('/api/v1/auth/login').send({ email: 'owner@afrigo.africa', password: 'StaffPassword1', platform: 'admin' })).body.mfaToken
    expect((await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: await login(), recoveryCode })).status).toBe(200)
    expect((await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: await login(), recoveryCode })).status).toBe(400)
  })

  it('does not let administrators turn MFA off', async () => {
    const staff = await createStaff('owner@afrigo.africa', 'super_admin')
    const response = await api().post('/api/v1/auth/mfa/disable').set(bearer(staff.tokens.accessToken)).send({ code: totp(staff.secret, 1) })
    expect(response.body.error.code).toBe('MFA_REQUIRED')
  })

  it('rejects an MFA token used for the wrong step', async () => {
    const response = await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: 'x'.repeat(40), code: '123456' })
    expect(response.body.error.code).toBe('INVALID_MFA_TOKEN')
  })
})

describe('optional member MFA', () => {
  it('lets a member enable and disable MFA', async () => {
    const { tokens } = await register()
    const setup = await api().post('/api/v1/auth/mfa/setup').set(bearer(tokens.accessToken)).send({})
    const enabled = await api().post('/api/v1/auth/mfa/enable').set(bearer(tokens.accessToken)).send({ code: totp(setup.body.secret) })
    expect(enabled.body.recoveryCodes).toHaveLength(10)
    const login = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123' })
    expect(login.body.mfaRequired).toBe(true)
    const signedIn = await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: login.body.mfaToken, code: totp(setup.body.secret, 1) })
    expect(signedIn.status).toBe(200)
    expect((await api().post('/api/v1/auth/mfa/disable').set(bearer(signedIn.body.tokens.accessToken)).send({ code: totp(setup.body.secret, -1) })).status).toBe(400)
  })
})

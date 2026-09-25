import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { api, lastEmailToken, register, reset, sql } from './helpers.js'

beforeEach(reset)
afterAll(() => sql.end())

describe('registration', () => {
  it('creates an account, returns tokens and sends a verification email', async () => {
    const response = await api().post('/api/v1/auth/register').send({ firstName: 'Ada', lastName: 'Okafor', email: 'Ada@Example.com', password: 'Password123', country: 'NG' })
    expect(response.status).toBe(201)
    expect(response.body.user).toMatchObject({ email: 'ada@example.com', emailVerified: false, country: 'ng', locale: 'en', mfaEnabled: false })
    expect(response.body.user).not.toHaveProperty('passwordHash')
    expect(response.body.tokens.accessToken).toBeTruthy()
    expect(lastEmailToken('ada@example.com')).toBeTruthy()
  })

  it('rejects duplicate emails regardless of case', async () => {
    await register('ada@example.com')
    const response = await api().post('/api/v1/auth/register').send({ firstName: 'Ada', lastName: 'Okafor', email: 'ADA@example.com', password: 'Password123' })
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('EMAIL_TAKEN')
  })

  it('rejects weak passwords with field details', async () => {
    const response = await api().post('/api/v1/auth/register').send({ firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.com', password: 'short' })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
    expect(response.body.error.details[0].field).toBe('password')
  })
})

describe('login and sessions', () => {
  it('signs in and reads the current user', async () => {
    await register()
    const login = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123', platform: 'ios' })
    expect(login.status).toBe(200)
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe('ada@example.com')
  })

  it('uses one message for unknown email and wrong password', async () => {
    await register()
    const wrong = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Wrong12345' })
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrong12345' })
    expect(wrong.status).toBe(401)
    expect(unknown.body.error).toEqual(wrong.body.error)
  })

  it('locks the account after five failed attempts', async () => {
    await register()
    for (let attempt = 0; attempt < 5; attempt++) await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Wrong12345' })
    const locked = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123' })
    expect(locked.status).toBe(429)
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED')
  })

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const { tokens } = await register()
    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken })
    expect(first.status).toBe(200)
    expect(first.body.tokens.refreshToken).not.toBe(tokens.refreshToken)
    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken })
    expect(replay.status).toBe(401)
    const afterTheft = await api().post('/api/v1/auth/refresh').send({ refreshToken: first.body.tokens.refreshToken })
    expect(afterTheft.status).toBe(401)
  })

  it('logs out a single session', async () => {
    const { tokens } = await register()
    expect((await api().post('/api/v1/auth/logout').send({ refreshToken: tokens.refreshToken })).status).toBe(204)
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`)).status).toBe(401)
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken })).status).toBe(401)
  })

  it('signs out every device', async () => {
    const { tokens } = await register()
    const second = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123' })
    expect((await api().post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${tokens.accessToken}`)).status).toBe(204)
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${second.body.tokens.accessToken}`)).status).toBe(401)
  })

  it('lists and revokes sessions', async () => {
    const { tokens } = await register()
    const other = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123', platform: 'android' })
    const list = await api().get('/api/v1/auth/sessions').set('Authorization', `Bearer ${tokens.accessToken}`)
    expect(list.body.items).toHaveLength(2)
    const target = list.body.items.find((item: { current: boolean }) => !item.current)
    expect((await api().delete(`/api/v1/auth/sessions/${target.id}`).set('Authorization', `Bearer ${tokens.accessToken}`)).status).toBe(204)
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${other.body.tokens.accessToken}`)).status).toBe(401)
  })

  it('rejects members on the admin console', async () => {
    await register()
    const response = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123', platform: 'admin' })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('STAFF_ONLY')
  })
})

describe('email verification and passwords', () => {
  it('verifies email with a single use link', async () => {
    await register()
    const token = lastEmailToken('ada@example.com')
    const verified = await api().post('/api/v1/auth/email/verify').send({ token })
    expect(verified.status).toBe(200)
    expect(verified.body.user.emailVerified).toBe(true)
    expect((await api().post('/api/v1/auth/email/verify').send({ token })).body.error.code).toBe('INVALID_TOKEN')
  })

  it('resets a forgotten password and signs out old sessions', async () => {
    const { tokens } = await register()
    const forgot = await api().post('/api/v1/auth/password/forgot').send({ email: 'ada@example.com' })
    expect(forgot.status).toBe(202)
    const token = lastEmailToken('ada@example.com')
    expect((await api().post('/api/v1/auth/password/reset').send({ token, password: 'NewPassword456' })).status).toBe(204)
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`)).status).toBe(401)
    expect((await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'NewPassword456' })).status).toBe(200)
  })

  it('does not reveal whether an email exists', async () => {
    const response = await api().post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' })
    expect(response.status).toBe(202)
  })

  it('changes password and keeps the current session', async () => {
    const { tokens } = await register()
    const other = await api().post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'Password123' })
    const wrong = await api().post('/api/v1/auth/password/change').set('Authorization', `Bearer ${tokens.accessToken}`).send({ currentPassword: 'Nope12345', newPassword: 'NewPassword456' })
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD')
    const changed = await api().post('/api/v1/auth/password/change').set('Authorization', `Bearer ${tokens.accessToken}`).send({ currentPassword: 'Password123', newPassword: 'NewPassword456' })
    expect(changed.status).toBe(204)
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`)).status).toBe(200)
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${other.body.tokens.accessToken}`)).status).toBe(401)
  })
})

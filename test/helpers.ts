import request from 'supertest'
import { createApp } from '../src/app.js'
import { sql } from '../src/db/client.js'
import { hashPassword } from '../src/lib/crypto.js'
import { encrypt } from '../src/lib/encryption.js'
import { testOutbox } from '../src/lib/mailer.js'
import { codeAt, currentStep, generateSecret } from '../src/lib/totp.js'

export const app = createApp()

export const api = () => request(app)

export async function reset() {
  await sql`truncate table audit_events, auth_tokens, sessions, organisation_invitations, organisation_members, organisations, users restart identity cascade`
  await sql`update countries set enabled = ecowas`
  testOutbox.clear()
}

export const lastEmailToken = (to: string) => {
  const mail = [...testOutbox.messages].reverse().find(message => message.to === to)
  return mail?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? null
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function register(email = 'ada@example.com', password = 'Password123') {
  const response = await api().post('/api/v1/auth/register').send({ firstName: 'Ada', lastName: 'Okafor', email, password, country: 'NG', platform: 'web' })
  return response.body as { user: { id: string; email: string }; tokens: { accessToken: string; refreshToken: string } }
}

export const totp = (secret: string, offset = 0) => codeAt(secret, currentStep() + offset)

export async function createStaff(email: string, role: string, password = 'StaffPassword1') {
  const secret = generateSecret()
  await sql`insert into users (email, password_hash, first_name, last_name, staff_role, email_verified_at, platform, mfa_secret, mfa_enabled_at) values (${email}, ${await hashPassword(password)}, 'Staff', 'Member', ${role}, now(), 'admin', ${encrypt(secret)}, now())`
  const login = await api().post('/api/v1/auth/login').send({ email, password, platform: 'admin' })
  const response = await api().post('/api/v1/auth/mfa/challenge').send({ mfaToken: login.body.mfaToken, code: totp(secret) })
  return { ...(response.body as { user: { id: string }; tokens: { accessToken: string } }), secret }
}

export const business = { name: 'Okafor Agro Ltd', types: ['exporter', 'aggregator'], country: 'NG', registrationNumber: 'RC123456', city: 'Lagos' }

export { sql }

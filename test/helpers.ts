import request from 'supertest'
import { createApp } from '../src/app.js'
import { sql } from '../src/db/client.js'
import { hashPassword } from '../src/lib/crypto.js'
import { testOutbox } from '../src/lib/mailer.js'

export const app = createApp()

export const api = () => request(app)

export async function reset() {
  await sql`truncate table audit_events, auth_tokens, sessions, users restart identity cascade`
  testOutbox.clear()
}

export const lastEmailToken = (to: string) => {
  const mail = [...testOutbox.messages].reverse().find(message => message.to === to)
  return mail?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? null
}

export async function register(email = 'ada@example.com', password = 'Password123') {
  const response = await api().post('/api/v1/auth/register').send({ firstName: 'Ada', lastName: 'Okafor', email, password, country: 'NG', platform: 'web' })
  return response.body as { user: { id: string; email: string }; tokens: { accessToken: string; refreshToken: string } }
}

export async function createStaff(email: string, role: string, password = 'StaffPassword1') {
  await sql`insert into users (email, password_hash, first_name, last_name, staff_role, email_verified_at, platform) values (${email}, ${await hashPassword(password)}, 'Staff', 'Member', ${role}, now(), 'admin')`
  const response = await api().post('/api/v1/auth/login').send({ email, password, platform: 'admin' })
  return response.body as { user: { id: string }; tokens: { accessToken: string } }
}

export { sql }

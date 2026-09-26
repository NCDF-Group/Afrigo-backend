import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { api, reset, sql } from './helpers.js'

beforeEach(reset)
afterAll(() => sql.end())

const register = (headers: Record<string, string>, email: string) =>
  api().post('/api/v1/auth/register').set(headers).send({ firstName: 'Ada', lastName: 'Okafor', email, password: 'Password123' })

const recordedIp = async (email: string) => {
  const [row] = await sql`select a.ip_address from audit_events a join users u on u.id = a.actor_id where u.email = ${email} and a.action = 'auth.register'`
  return row?.ip_address as string
}

describe('client ip from the website proxy', () => {
  it('uses the forwarded ip when the proxy secret matches', async () => {
    await register({ 'x-afrigo-proxy-secret': 'proxy-secret-for-tests', 'x-afrigo-client-ip': '102.89.34.10' }, 'trusted@example.com')
    expect(await recordedIp('trusted@example.com')).toBe('102.89.34.10')
  })

  it('ignores a forwarded ip without the right secret', async () => {
    await register({ 'x-afrigo-proxy-secret': 'wrong-secret-value-here', 'x-afrigo-client-ip': '102.89.34.10' }, 'spoof@example.com')
    expect(await recordedIp('spoof@example.com')).not.toBe('102.89.34.10')
  })
})

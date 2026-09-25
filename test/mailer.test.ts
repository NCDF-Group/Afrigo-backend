import { describe, expect, it } from 'vitest'
import { brevoPayload, parseSender } from '../src/lib/mailer.js'

describe('sender parsing', () => {
  it('splits a display name from the address', () => {
    expect(parseSender('AfriGoOS <odarafounder@gmail.com>')).toEqual({ name: 'AfriGoOS', email: 'odarafounder@gmail.com' })
    expect(parseSender('"AfriGoOS Team" <no-reply@afrigo.africa>')).toEqual({ name: 'AfriGoOS Team', email: 'no-reply@afrigo.africa' })
    expect(parseSender('no-reply@afrigo.africa')).toEqual({ email: 'no-reply@afrigo.africa' })
  })

  it('builds the Brevo transactional email payload', () => {
    const payload = brevoPayload({ to: 'buyer@test.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }, 'AfriGoOS <odarafounder@gmail.com>')
    expect(payload).toEqual({ sender: { name: 'AfriGoOS', email: 'odarafounder@gmail.com' }, to: [{ email: 'buyer@test.com' }], subject: 'Hello', htmlContent: '<p>Hi</p>', textContent: 'Hi' })
  })
})

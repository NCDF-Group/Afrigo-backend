import { eq, sql as raw } from 'drizzle-orm'
import { hashPassword } from '../lib/crypto.js'
import { db, sql } from './client.js'
import { users } from './schema.js'

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.SEED_ADMIN_PASSWORD
const [firstName = 'Afrigo', lastName = 'Admin'] = (process.env.SEED_ADMIN_NAME ?? 'Afrigo Admin').trim().split(/\s+(.*)/)

try {
  if (!email || !password || password.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least 12 characters).')
  const passwordHash = await hashPassword(password)
  const [existing] = await db.select().from(users).where(raw`lower(${users.email}) = ${email}`).limit(1)
  if (existing) {
    await db.update(users).set({ staffRole: 'super_admin', status: 'active', passwordHash, emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), tokenVersion: raw`${users.tokenVersion} + 1` }).where(eq(users.id, existing.id))
    console.log(`${email} is now a super administrator. Its password was reset.`)
  } else {
    await db.insert(users).values({ email, passwordHash, firstName, lastName, staffRole: 'super_admin', emailVerifiedAt: new Date(), platform: 'admin' })
    console.log(`Created super administrator ${email}.`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}

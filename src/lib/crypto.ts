import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (password: string, salt: string, length: number, options: { N: number; r: number; p: number }) => Promise<Buffer>
const PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LENGTH = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS)
  return `scrypt$${PARAMS.N}$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false
  const [scheme, cost, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const derived = await scrypt(password, salt, expected.length, { ...PARAMS, N: Number(cost) })
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export function recoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase()
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

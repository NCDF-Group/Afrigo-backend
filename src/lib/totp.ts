import { createHmac, randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function generateSecret() {
  const bytes = randomBytes(20)
  let bits = ''
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0')
  let output = ''
  for (let index = 0; index + 5 <= bits.length; index += 5) output += ALPHABET[parseInt(bits.slice(index, index + 5), 2)]
  return output
}

function decode(secret: string) {
  let bits = ''
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    const value = ALPHABET.indexOf(char)
    if (value < 0) throw new Error('Invalid secret')
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}

export const currentStep = (time = Date.now()) => Math.floor(time / 1000 / STEP_SECONDS)

export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', decode(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return value.toString().padStart(DIGITS, '0')
}

export function verifyCode(secret: string, code: string, lastStep: number | null, time = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const now = currentStep(time)
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue
    if (codeAt(secret, step) === code) return step
  }
  return null
}

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`AfriGoOS:${account}`)}?secret=${secret}&issuer=AfriGoOS&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`

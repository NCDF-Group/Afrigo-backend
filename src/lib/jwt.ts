import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env.js'

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)
const ISSUER = 'afrigo-api'
const AUDIENCE = 'afrigo'

export type AccessClaims = { sub: string; sid: string; tv: number }

export async function signAccessToken(claims: AccessClaims) {
  return new SignJWT({ sid: claims.sid, tv: claims.tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.tv !== 'number') return null
    return { sub: payload.sub, sid: payload.sid, tv: payload.tv }
  } catch {
    return null
  }
}

const MFA_AUDIENCE = 'afrigo-mfa'

export type MfaClaims = { sub: string; platform?: string; mode: 'challenge' | 'setup' }

export async function signMfaToken(claims: MfaClaims) {
  return new SignJWT({ platform: claims.platform, mode: claims.mode })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret)
}

export async function verifyMfaToken(token: string): Promise<MfaClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: MFA_AUDIENCE, algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || (payload.mode !== 'challenge' && payload.mode !== 'setup')) return null
    return { sub: payload.sub, platform: typeof payload.platform === 'string' ? payload.platform : undefined, mode: payload.mode }
  } catch {
    return null
  }
}

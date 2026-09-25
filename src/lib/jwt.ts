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

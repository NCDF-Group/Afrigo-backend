import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { isIP } from 'node:net'
import { env } from '../config/env.js'

const matches = (provided: string, expected: string) => {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function clientIp(request: Request) {
  const secret = env.TRUSTED_PROXY_SECRET
  const provided = request.get('x-afrigo-proxy-secret')
  const forwarded = request.get('x-afrigo-client-ip')?.trim()
  if (secret && provided && forwarded && isIP(forwarded) && matches(provided, secret)) return forwarded
  return request.ip ?? 'unknown'
}

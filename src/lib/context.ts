import type { Request } from 'express'
import { PLATFORMS, type Platform } from './roles.js'
import type { ClientContext } from '../modules/auth/auth.service.js'

export function clientContext(request: Request): ClientContext {
  const platform = request.get('x-client-platform')
  const appVersion = request.get('x-app-version')
  return {
    platform: (PLATFORMS as readonly string[]).includes(platform ?? '') ? (platform as Platform) : undefined,
    appVersion: appVersion && /^\d+\.\d+\.\d+$/.test(appVersion) ? appVersion : undefined,
    userAgent: request.get('user-agent'),
    ipAddress: request.ip
  }
}

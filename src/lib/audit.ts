import type { Request } from 'express'
import { db } from '../db/client.js'
import { auditEvents } from '../db/schema.js'
import { logger } from './logger.js'

type AuditInput = { actorId?: string | null; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; request?: Request }

export async function audit({ actorId, action, targetType, targetId, metadata = {}, request }: AuditInput) {
  try {
    await db.insert(auditEvents).values({
      actorId: actorId ?? null,
      action,
      targetType,
      targetId,
      metadata,
      ipAddress: request?.ip ?? null,
      userAgent: request?.get('user-agent')?.slice(0, 300) ?? null
    })
  } catch (error) {
    logger.error({ err: error, action }, 'Audit write failed')
  }
}

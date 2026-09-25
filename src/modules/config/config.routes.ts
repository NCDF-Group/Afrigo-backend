import { asc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { countries } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { notFound } from '../../lib/errors.js'
import { parse } from '../../lib/validate.js'
import { requireStaff } from '../../middleware/authenticate.js'

const listQuery = z.object({ enabled: z.enum(['true', 'false']).optional() })
const params = z.object({ iso2: z.string().trim().length(2).toLowerCase() })
const updateSchema = z
  .object({ enabled: z.boolean(), pilot: z.boolean(), currency: z.string().trim().length(3).toUpperCase() })
  .partial()
  .refine(value => Object.keys(value).length > 0, 'Send at least one field to update.')

export const configRouter = Router()

configRouter.get('/countries', async (request, response) => {
  const { enabled } = parse(listQuery, request.query)
  const rows = await db
    .select()
    .from(countries)
    .where(enabled ? eq(countries.enabled, enabled === 'true') : undefined)
    .orderBy(asc(countries.name))
  response.set('Cache-Control', 'public, max-age=300').json({ items: rows })
})

export const adminConfigRouter = Router()

adminConfigRouter.patch('/countries/:iso2', requireStaff('apps:manage'), async (request, response) => {
  const { iso2 } = parse(params, request.params)
  const input = parse(updateSchema, request.body)
  const [country] = await db.update(countries).set(input).where(eq(countries.iso2, iso2)).returning()
  if (!country) throw notFound('Country')
  await audit({ actorId: request.auth!.user.id, action: 'admin.config.country_updated', targetType: 'country', targetId: iso2, metadata: input, request })
  response.json({ country })
})

import { z } from 'zod'

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})

export const idSchema = z.object({ id: z.uuid('Invalid id.') })

export const paged = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) })

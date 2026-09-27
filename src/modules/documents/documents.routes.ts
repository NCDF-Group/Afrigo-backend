import express, { Router, type Response } from 'express'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { pageSchema } from '../../lib/pagination.js'
import { parse } from '../../lib/validate.js'
import { requireAuth, requireStaff } from '../../middleware/authenticate.js'
import * as service from './documents.service.js'

const orgParams = z.object({ id: z.uuid('Invalid id.') })
const docParams = z.object({ id: z.uuid('Invalid id.'), documentId: z.uuid('Invalid id.') })
const uploadQuery = z.object({ kind: z.enum(service.DOCUMENT_KINDS), fileName: z.string().trim().min(1).max(200) })
const reviewQuery = pageSchema.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional(), organisationId: z.uuid().optional() })
const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), note: z.string().trim().max(1000).optional() }),
  z.object({ decision: z.literal('reject'), note: z.string().trim().min(3, 'Tell the business what is wrong with this document.').max(1000) })
])
const rawUpload = express.raw({ type: service.ACCEPTED_TYPES, limit: service.MAX_DOCUMENT_BYTES })

function sendFile(response: Response, file: { fileName: string; mimeType: string; content: Buffer }, download: boolean) {
  response
    .status(200)
    .set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.content.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    })
    .send(file.content)
}

export const organisationDocumentsRouter = Router({ mergeParams: true })

organisationDocumentsRouter.get('/', requireAuth, async (request, response) => {
  const { id } = parse(orgParams, request.params)
  response.json({ items: await service.listDocuments(request.auth!.user.id, id) })
})

organisationDocumentsRouter.post('/', requireAuth, rawUpload, async (request, response) => {
  const { id } = parse(orgParams, request.params)
  const { kind, fileName } = parse(uploadQuery, request.query)
  const content = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)
  const document = await service.uploadDocument(request.auth!.user, id, { kind, fileName, mimeType: String(request.get('content-type')).split(';')[0].trim(), content })
  await audit({ actorId: request.auth!.user.id, action: 'document.uploaded', targetType: 'document', targetId: document.id, metadata: { organisationId: id, kind, sizeBytes: document.sizeBytes }, request })
  response.status(201).json({ document })
})

organisationDocumentsRouter.get('/:documentId/file', requireAuth, async (request, response) => {
  const { id, documentId } = parse(docParams, request.params)
  sendFile(response, await service.documentFile(request.auth!.user.id, id, documentId), request.query.download === '1')
})

organisationDocumentsRouter.delete('/:documentId', requireAuth, async (request, response) => {
  const { id, documentId } = parse(docParams, request.params)
  await service.deleteDocument(request.auth!.user.id, id, documentId)
  await audit({ actorId: request.auth!.user.id, action: 'document.deleted', targetType: 'document', targetId: documentId, metadata: { organisationId: id }, request })
  response.status(204).end()
})

export const adminDocumentsRouter = Router()

adminDocumentsRouter.get('/', requireStaff('risk:read'), async (request, response) => {
  response.json(await service.listForReview(parse(reviewQuery, request.query)))
})

adminDocumentsRouter.get('/:documentId/file', requireStaff('risk:read'), async (request, response) => {
  const { documentId } = parse(z.object({ documentId: z.uuid('Invalid id.') }), request.params)
  await audit({ actorId: request.auth!.user.id, action: 'admin.document.viewed', targetType: 'document', targetId: documentId, request })
  sendFile(response, await service.adminDocumentFile(documentId), request.query.download === '1')
})

adminDocumentsRouter.post('/:documentId/review', requireStaff('compliance:review'), async (request, response) => {
  const { documentId } = parse(z.object({ documentId: z.uuid('Invalid id.') }), request.params)
  const input = parse(reviewSchema, request.body)
  const document = await service.reviewDocument(request.auth!.user, documentId, input.decision, input.note)
  await audit({ actorId: request.auth!.user.id, action: `admin.document.${input.decision}`, targetType: 'document', targetId: documentId, metadata: { note: input.note ?? null }, request })
  response.json({ document })
})

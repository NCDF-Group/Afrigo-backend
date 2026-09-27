import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { documents, organisations, users, type User } from '../../db/schema.js'
import { sha256 } from '../../lib/crypto.js'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { paged } from '../../lib/pagination.js'
import { requireMembership } from '../organisations/organisations.service.js'

export const DOCUMENT_KINDS = ['registration_certificate', 'tax_certificate', 'director_id', 'proof_of_address', 'export_licence', 'other'] as const
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const MAX_PER_ORGANISATION = 30

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

const SIGNATURES: Record<string, (content: Buffer) => boolean> = {
  'application/pdf': content => content.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': content => content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': content => content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
}

export const ACCEPTED_TYPES = Object.keys(SIGNATURES)

const metadata = {
  id: documents.id,
  organisationId: documents.organisationId,
  kind: documents.kind,
  fileName: documents.fileName,
  mimeType: documents.mimeType,
  sizeBytes: documents.sizeBytes,
  status: documents.status,
  reviewNote: documents.reviewNote,
  reviewedAt: documents.reviewedAt,
  createdAt: documents.createdAt
}

const cleanName = (value: string) => value.replace(/[\\/\r\n"]/g, '').trim().slice(0, 160) || 'document'

export async function uploadDocument(user: User, organisationId: string, input: { kind: DocumentKind; fileName: string; mimeType: string; content: Buffer }) {
  const { organisation } = await requireMembership(user.id, organisationId)
  if (organisation.status !== 'active') throw forbidden('ORGANISATION_SUSPENDED', 'This business is suspended.')
  if (!input.content.length) throw badRequest('EMPTY_FILE', 'The file is empty.')
  if (input.content.length > MAX_DOCUMENT_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'Files must be 10 MB or smaller.')
  const matches = SIGNATURES[input.mimeType]
  if (!matches || !matches(input.content)) throw badRequest('UNSUPPORTED_FILE', 'Upload a PDF, PNG or JPEG file.')
  const [{ total }] = await db.select({ total: count() }).from(documents).where(eq(documents.organisationId, organisationId))
  if (total >= MAX_PER_ORGANISATION) throw conflict('TOO_MANY_DOCUMENTS', 'Remove an old document before uploading another.')
  const [created] = await db
    .insert(documents)
    .values({ organisationId, uploadedBy: user.id, kind: input.kind, fileName: cleanName(input.fileName), mimeType: input.mimeType, sizeBytes: input.content.length, sha256: sha256(input.content.toString('base64')), content: input.content })
    .returning(metadata)
  return created
}

export async function listDocuments(userId: string, organisationId: string) {
  await requireMembership(userId, organisationId)
  return db.select(metadata).from(documents).where(eq(documents.organisationId, organisationId)).orderBy(desc(documents.createdAt))
}

async function fileRow(where: SQL) {
  const [row] = await db.select({ fileName: documents.fileName, mimeType: documents.mimeType, content: documents.content }).from(documents).where(where).limit(1)
  if (!row) throw notFound('Document')
  return row
}

export async function documentFile(userId: string, organisationId: string, documentId: string) {
  await requireMembership(userId, organisationId)
  return fileRow(and(eq(documents.id, documentId), eq(documents.organisationId, organisationId))!)
}

export async function deleteDocument(userId: string, organisationId: string, documentId: string) {
  const { role } = await requireMembership(userId, organisationId)
  const [document] = await db.select(metadata).from(documents).where(and(eq(documents.id, documentId), eq(documents.organisationId, organisationId))).limit(1)
  if (!document) throw notFound('Document')
  if (document.status === 'approved' && role !== 'administrator') throw forbidden('ORGANISATION_ADMIN_ONLY', 'Only business administrators can remove an approved document.')
  await db.delete(documents).where(eq(documents.id, documentId))
}

export async function listForReview(filters: { status?: 'pending' | 'approved' | 'rejected'; organisationId?: string; page: number; pageSize: number }) {
  const conditions = [filters.status ? eq(documents.status, filters.status) : undefined, filters.organisationId ? eq(documents.organisationId, filters.organisationId) : undefined].filter(Boolean) as SQL[]
  const where = conditions.length ? and(...conditions) : undefined
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...metadata, organisationName: organisations.name, organisationCountry: organisations.country, uploaderEmail: users.email })
      .from(documents)
      .innerJoin(organisations, eq(organisations.id, documents.organisationId))
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(where)
      .orderBy(filters.status === 'pending' ? documents.createdAt : desc(documents.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(documents).where(where)
  ])
  return paged(rows, total, filters.page, filters.pageSize)
}

export const adminDocumentFile = (documentId: string) => fileRow(eq(documents.id, documentId))

export async function reviewDocument(reviewer: User, documentId: string, decision: 'approve' | 'reject', note?: string) {
  const [updated] = await db
    .update(documents)
    .set({ status: decision === 'approve' ? 'approved' : 'rejected', reviewNote: note ?? null, reviewedBy: reviewer.id, reviewedAt: new Date() })
    .where(eq(documents.id, documentId))
    .returning(metadata)
  if (!updated) throw notFound('Document')
  return updated
}

export const documentCount = async (organisationId: string) => (await db.select({ total: count() }).from(documents).where(eq(documents.organisationId, organisationId)))[0].total

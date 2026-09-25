import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env.js'
import * as schema from './schema.js'

const ssl = env.DATABASE_SSL === 'true' ? 'require' : env.DATABASE_SSL === 'false' ? false : /render\.com/.test(env.DATABASE_URL) ? 'require' : false

export const sql = postgres(env.DATABASE_URL, { max: env.DATABASE_POOL_SIZE, ssl, onnotice: () => {} })

export const db = drizzle(sql, { schema })

export type Database = typeof db

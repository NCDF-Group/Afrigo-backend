import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, sql } from './client.js'

try {
  await migrate(db, { migrationsFolder: 'drizzle' })
  console.log('Database is up to date.')
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await sql.end()
}

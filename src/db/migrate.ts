import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { db, sqlite } from './client'

migrate(db, { migrationsFolder: './drizzle' })
sqlite.close()
console.log('Database migrations applied.')

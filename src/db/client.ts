import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const filename = process.env.DB_FILE_NAME ?? 'jobs.db'
const sqlite = new Database(filename, { create: true })
sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')

export const db = drizzle({ client: sqlite, schema })
export { sqlite }

import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedAt, migrationFolderUpTo, removeTempDir } from './support/migrations'

test('0031 preserves populated parents, raw posts and children while allowing unknown posted dates', () => {
  const folder = migrationFolderUpTo(30)
  const sqlite = migratedAt(folder)
  try {
    sqlite.exec(`
      INSERT INTO companies(id,name,created_at,updated_at) VALUES(1,'Example','2026-10-01','2026-10-01');
      INSERT INTO job_applications(id,company_id,job_title,url,posted_date,created_at,updated_at)
      VALUES(1,1,'Engineer','https://example.com/job/1','2026-09-30','2026-10-01','2026-10-01');
      INSERT INTO job_postings(id,job_application_id,raw_text,captured_at,content_hash)
      VALUES(1,1,'Original raw job text','2026-10-01T12:00:00Z','example-hash');
      INSERT INTO follow_ups(id,job_application_id,action_date,action_type,notes,created_at,updated_at)
      VALUES(1,1,'2026-10-02','email','Original follow up','2026-10-02','2026-10-02');
    `)
    migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
    expect(sqlite.query('SELECT posted_date FROM job_applications WHERE id=1').get()).toEqual({
      posted_date: '2026-09-30',
    })
    expect(sqlite.query('SELECT raw_text FROM job_postings WHERE id=1').get()).toEqual({
      raw_text: 'Original raw job text',
    })
    expect(sqlite.query('SELECT notes FROM follow_ups WHERE id=1').get()).toEqual({
      notes: 'Original follow up',
    })
    expect(
      sqlite
        .query('SELECT job_application_id FROM job_source_identities WHERE identity=?')
        .get('url:https://example.com/job/1'),
    ).toEqual({ job_application_id: 1 })
    sqlite.exec('UPDATE job_applications SET posted_date=NULL WHERE id=1')
    expect(sqlite.query('SELECT posted_date FROM job_applications WHERE id=1').get()).toEqual({
      posted_date: null,
    })
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    sqlite.exec('DELETE FROM job_applications WHERE id=1')
    expect(sqlite.query('SELECT * FROM job_source_identities').all()).toEqual([])
    expect(sqlite.query('SELECT * FROM job_postings').all()).toEqual([])
  } finally {
    sqlite.close()
    removeTempDir(folder)
  }
})

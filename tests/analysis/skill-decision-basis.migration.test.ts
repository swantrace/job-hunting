import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedAt, migrationFolderUpTo, removeTempDir } from '../db/support/migrations'

test('decision-basis migration preserves existing decisions and self references', () => {
  const folder = migrationFolderUpTo(31)
  const sqlite = migratedAt(folder)
  try {
    const seed = `
      INSERT INTO companies(id,name,created_at,updated_at) VALUES(1,'Synthetic','2026-10-16','2026-10-16');
      INSERT INTO job_applications(id,company_id,job_title,direction,status,created_at,updated_at) VALUES(1,1,'Engineer','fullstack','Saved','2026-10-16','2026-10-16');
      INSERT INTO job_postings(id,job_application_id,raw_text,content_hash,captured_at) VALUES(1,1,'Synthetic post','hash','2026-10-16');
      INSERT INTO job_posting_analyses(id,job_posting_id,status,created_at,updated_at) VALUES(1,1,'Queued','2026-10-16','2026-10-16');
      INSERT INTO application_analysis_runs(id,job_posting_analysis_id,status,queue_job_id,created_at,updated_at) VALUES(1,1,'Completed','a','2026-10-16','2026-10-16'),(2,1,'Completed','b','2026-10-16','2026-10-16');
      INSERT INTO skills(id,key,name,created_at,updated_at) VALUES(1,'react','React','2026-10-16','2026-10-16');
      INSERT INTO analysis_run_decisions(id,application_analysis_run_id,skill_id,decision,reason,previous_decision_id,created_at,updated_at) VALUES(1,1,1,'include','Actual experience',NULL,'2026-10-16','2026-10-16'),(2,2,1,'include','Actual experience',1,'2026-10-16','2026-10-16');
    `
    for (const statement of seed.split(';').filter((sql) => sql.trim())) sqlite.exec(statement)
    expect(sqlite.query('SELECT count(*) AS n FROM analysis_run_decisions').get()).toEqual({ n: 2 })
    migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
    expect(
      sqlite
        .query(
          'SELECT previous_decision_id,reason,include_basis,basis_hash FROM analysis_run_decisions WHERE id=2',
        )
        .get(),
    ).toEqual({
      previous_decision_id: 1,
      reason: 'Actual experience',
      include_basis: 'user-reason',
      basis_hash: null,
    })
    expect(() => sqlite.exec('UPDATE analysis_run_decisions SET reason=NULL WHERE id=2')).toThrow()
    sqlite.exec(
      "UPDATE analysis_run_decisions SET include_basis='transferable', reason=NULL WHERE id=2",
    )
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
  } finally {
    sqlite.close()
    removeTempDir(folder)
  }
})

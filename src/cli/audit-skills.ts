import { Database } from 'bun:sqlite'

/**
 * Read-only skill taxonomy audit.
 *
 * Reports exact normalized duplicates, probable aliases, skills with no
 * application relationships, and likely non-skill values. It never mutates the
 * database: the connection is opened read-only and no write statements run.
 * Similarity findings are suggestions for manual review and are never merged.
 */

const dbFile = process.env.DB_FILE_NAME ?? 'jobs.db'

type SkillRow = { id: number; name: string; applications: number }

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function aliasFingerprint(value: string) {
  return normalize(value).replace(/[.\-_/\s]+/g, '')
}

// Names whose meaning depends on punctuation that the alias fingerprint strips.
const punctuationSensitive = new Set(['.net', 'c', 'c++', 'c#'])

// Working arrangements, benefits, and other non-skill signals the parser should
// eventually refuse to store as skills. Kept as review guidance, not authority.
const nonSkillTerms = [
  'remote',
  'hybrid',
  'on-site',
  'onsite',
  'work from home',
  'work-from-home',
  'wfh',
  'relocation',
  'relocate',
  'full-time',
  'part-time',
  'contract',
  'permanent',
  'freelance',
  'benefits',
  'health insurance',
  'dental',
  'vision',
  '401k',
  '401(k)',
  'stock options',
  'equity',
  'visa sponsorship',
  'sponsorship',
  'paid time off',
  'pto',
]

type AuditReport = {
  database: string
  normalizedDuplicates: string[][]
  probableAliases: { skills: string[]; reason: string }[]
  unreferenced: { id: number; name: string }[]
  likelyNonSkills: { id: number; name: string }[]
}

function audit(sqlite: Database): AuditReport {
  const rows = sqlite
    .query(
      `SELECT s.id AS id, s.name AS name, count(j.skill_id) AS applications
       FROM skills AS s
       LEFT JOIN job_applications_to_skills AS j ON j.skill_id = s.id
       GROUP BY s.id
       ORDER BY lower(s.name), s.id`,
    )
    .all() as SkillRow[]

  const normalizedDuplicates: string[][] = []
  const probableAliases: { skills: string[]; reason: string }[] = []
  const groups = new Map<string, SkillRow[]>()
  for (const row of rows) {
    const key = normalize(row.name)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.length > 1) normalizedDuplicates.push(group.map((row) => row.name))
  }

  const fingerprints = new Map<string, SkillRow[]>()
  for (const row of rows) {
    const fingerprint = aliasFingerprint(row.name)
    const group = fingerprints.get(fingerprint) ?? []
    group.push(row)
    fingerprints.set(fingerprint, group)
  }
  const seen = new Set<string>()
  for (const group of fingerprints.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]
        const b = group[j]
        if (normalize(a.name) === normalize(b.name)) continue
        if (
          punctuationSensitive.has(normalize(a.name)) ||
          punctuationSensitive.has(normalize(b.name))
        )
          continue
        const pairKey = [a.name, b.name].sort().join('\u0000')
        if (seen.has(pairKey)) continue
        seen.add(pairKey)
        probableAliases.push({
          skills: [a.name, b.name],
          reason: 'identical after removing separators',
        })
      }
    }
  }

  // Catch shorter-name prefixes that only add a suffix token (react -> reactjs).
  const names = rows.map((row) => row)
  for (let i = 0; i < names.length; i += 1) {
    for (let j = 0; j < names.length; j += 1) {
      if (i === j) continue
      const a = names[i]
      const b = names[j]
      const short = normalize(a.name)
      const long = normalize(b.name)
      if (short.length < 3 || long.length <= short.length) continue
      if (!long.startsWith(short)) continue
      if (punctuationSensitive.has(short) || punctuationSensitive.has(long)) continue
      const pairKey = [a.name, b.name].sort().join('\u0000')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)
      probableAliases.push({
        skills: [a.name, b.name],
        reason: 'shorter name is a prefix of the longer name',
      })
    }
  }

  const unreferenced = rows
    .filter((row) => row.applications === 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
    }))

  const likelyNonSkills = rows
    .filter((row) => nonSkillTerms.includes(normalize(row.name)))
    .map((row) => ({ id: row.id, name: row.name }))

  return { database: dbFile, normalizedDuplicates, probableAliases, unreferenced, likelyNonSkills }
}

function printHuman(report: AuditReport) {
  const count = (items: unknown[]) => items.length
  console.log(`Skill taxonomy audit — ${report.database}\n`)

  console.log(`Exact normalized duplicates (${count(report.normalizedDuplicates)})`)
  for (const group of report.normalizedDuplicates) console.log(`  - ${group.join(' ⇄ ')}`)
  if (!report.normalizedDuplicates.length) console.log('  none')

  console.log(
    `\nProbable aliases — suggestions, never auto-merged (${count(report.probableAliases)})`,
  )
  for (const alias of report.probableAliases)
    console.log(`  - ${alias.skills.join(' ⇄ ')} (${alias.reason})`)
  if (!report.probableAliases.length) console.log('  none')

  console.log(`\nNo application relations (${count(report.unreferenced)})`)
  for (const skill of report.unreferenced) console.log(`  - ${skill.name} (#${skill.id})`)
  if (!report.unreferenced.length) console.log('  none')

  console.log(`\nLikely non-skill values — review (${count(report.likelyNonSkills)})`)
  for (const skill of report.likelyNonSkills) console.log(`  - ${skill.name} (#${skill.id})`)
  if (!report.likelyNonSkills.length) console.log('  none')
}

function main() {
  const asJson = process.argv.includes('--json')
  let sqlite: Database
  try {
    sqlite = new Database(dbFile, { readonly: true })
  } catch {
    const empty: AuditReport = {
      database: dbFile,
      normalizedDuplicates: [],
      probableAliases: [],
      unreferenced: [],
      likelyNonSkills: [],
    }
    if (asJson) console.log(JSON.stringify(empty, null, 2))
    else console.log(`No database found at ${dbFile}. Run migrations and a career sync first.`)
    return
  }
  try {
    const report = audit(sqlite)
    if (asJson) console.log(JSON.stringify(report, null, 2))
    else printHuman(report)
  } finally {
    sqlite.close()
  }
}

main()

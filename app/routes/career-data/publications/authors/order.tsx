import { createRoute } from 'honox/factory'
import type { PublicationAuthorFormValues } from '../../../../../src/lib/career/form-input'
import { parseForm } from '../../../../../src/lib/request'
import { PublicationAuthorsField } from '../../../../components/career/PublicationAuthorsField'

function stringList(value: unknown): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]
}

/**
 * Reorders one publication author. It is deliberately stateless: the buttons
 * send the whole open form, this swaps the two affected rows and returns only
 * the author field, so the candidate toggle and every unsaved name survive the
 * round trip and nothing is written to the database.
 */
export const POST = createRoute(async (c) => {
  const raw = await parseForm(c)
  const candidates = new Set(stringList(raw.authorCandidate).map((entry) => Number(entry)))
  const rows: PublicationAuthorFormValues[] = stringList(raw.authorName).map((name, index) => ({
    name: name.trim(),
    isCandidate: candidates.has(index),
  }))
  const index = Number(raw.index)
  const action = String(raw.action ?? '')
  const target = action === 'up' ? index - 1 : action === 'down' ? index + 1 : -1
  if (
    Number.isInteger(index) &&
    index >= 0 &&
    index < rows.length &&
    target >= 0 &&
    target < rows.length
  ) {
    const moved = rows[index]
    rows[index] = rows[target]
    rows[target] = moved
  }
  return c.html(<PublicationAuthorsField authors={rows.filter((row) => row.name !== '')} />)
})

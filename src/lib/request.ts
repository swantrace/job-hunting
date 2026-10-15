import type { Context } from 'hono'
import { filterSchema, formObject, workspaceTabSchema } from './validation'

export const parseFilters = (c: Context) => {
  const query = c.req.query()
  const statuses = c.req.queries('statuses')
  const attributes = c.req.queries('attributes')
  return filterSchema.parse({
    ...query,
    statuses: statuses?.join(',') ?? '',
    attributes: attributes?.join(',') ?? '',
  })
}
export const parseWorkspaceTab = (c: Context) =>
  workspaceTabSchema.parse(c.req.query('workspaceTab'))
export async function parseForm(c: Context) {
  return formObject(await c.req.formData())
}
export const parseId = (value: string | undefined) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * Points a form-fragment response at the form root it owns when the request did
 * not originate there. Validation (422) and stale-revision (409) responses carry
 * only that form, never a whole page inside a swap.
 */
export function retargetFragment(c: Context, rootId: string): void {
  if (c.req.header('HX-Target') === rootId) return
  c.header('HX-Retarget', `#${rootId}`)
  c.header('HX-Reswap', 'outerHTML')
}

/** Reads a checkbox-style query flag: `?showRetired=on|1` is true, absent is false. */
export function queryFlag(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0' && value !== 'false'
}

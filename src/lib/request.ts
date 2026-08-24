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

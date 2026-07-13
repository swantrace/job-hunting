import type { Context } from 'hono'
import { filterSchema, formObject } from './validation'

export const parseFilters = (c: Context) => filterSchema.parse(c.req.query())
export async function parseForm(c: Context) {
  return formObject(await c.req.formData())
}
export const parseId = (value: string | undefined) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

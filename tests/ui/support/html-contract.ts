import { Hono } from 'hono'

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export type FragmentRecord = {
  depth: number
  id: string
  oob?: string
  tag: string
}

export async function renderJsx(node: unknown): Promise<string> {
  const app = new Hono()
  app.get('/', (c) => c.html(node as never))
  const response = await app.request('/')
  return response.text()
}

export function fragmentRecords(html: string): FragmentRecord[] {
  const records: FragmentRecord[] = []
  const tags = /<!--(?:.|\n)*?-->|<\/?([a-zA-Z][\w:-]*)([^>]*)>/g
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = tags.exec(html))) {
    const source = match[0]
    if (source.startsWith('<!--')) continue

    const tag = match[1]?.toLowerCase()
    if (!tag) continue
    if (source.startsWith('</')) {
      depth = Math.max(0, depth - 1)
      continue
    }

    const attributes = match[2] ?? ''
    const id = readAttribute(attributes, 'id')
    if (id) {
      records.push({
        depth,
        id,
        oob: readAttribute(attributes, 'hx-swap-oob'),
        tag,
      })
    }

    if (!voidElements.has(tag) && !source.endsWith('/>')) depth += 1
  }

  return records
}

export function recordsFor(html: string, id: string): FragmentRecord[] {
  return fragmentRecords(html).filter((record) => record.id === id)
}

export function classTokens(html: string): string[] {
  return [...html.matchAll(/\sclass=(?:"([^"]*)"|'([^']*)')/g)].flatMap((match) =>
    (match[1] ?? match[2] ?? '').split(/\s+/).filter(Boolean),
  )
}

function readAttribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attributes.match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)')`))
  return match?.[1] ?? match?.[2]
}

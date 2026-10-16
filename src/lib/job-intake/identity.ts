import type { CaptureItem } from './contracts'

/** Exact source URL is always an alias, so rule changes cannot duplicate that URL. */
export function sourceIdentities(item: Pick<CaptureItem, 'sourceUrl' | 'identity'>): string[] {
  const url = new URL(item.sourceUrl)
  const keys = [`url:${url.href}`]
  const policy = item.identity?.policy
  if (policy) {
    for (const name of [...new Set(url.searchParams.keys())]) {
      if (
        policy.dropQueryParams.includes(name) ||
        (policy.queryMode === 'keep-listed' && !policy.queryParams.includes(name))
      )
        url.searchParams.delete(name)
    }
    if (policy.fragmentMode === 'drop') url.hash = ''
  }
  keys.push(`url:${url.href}`)
  const original = new URL(item.sourceUrl)
  let provider = original.hostname.toLowerCase()
  let verifiedId: string | null = null
  if (/(^|\.)linkedin\.com$/.test(provider)) {
    provider = 'linkedin.com'
    verifiedId =
      original.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1] ??
      original.searchParams.get('currentJobId')
  } else if (/(^|\.)indeed\.com$/.test(provider) || /(^|\.)indeed\.ca$/.test(provider)) {
    provider = 'indeed'
    verifiedId = original.searchParams.get('jk') ?? original.searchParams.get('vjk')
  } else if (item.identity?.providerJobId) {
    // A client supplied ID must occur in a URL path segment or query value.
    const values = [
      ...original.searchParams.values(),
      ...original.pathname.split('/').map((s) => {
        try {
          return decodeURIComponent(s)
        } catch {
          return s
        }
      }),
    ]
    if (values.includes(item.identity.providerJobId)) verifiedId = item.identity.providerJobId
  }
  if (verifiedId && (!item.identity?.providerJobId || item.identity.providerJobId === verifiedId))
    keys.push(`provider:${provider}:${verifiedId}`)
  return [...new Set(keys)]
}

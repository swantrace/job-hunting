export function resolveFieldId(
  id: string | undefined,
  namespace: string | undefined,
  name: string,
) {
  return id ?? (namespace ? `${namespace}-${name}` : name)
}

export function describedByIds(id: string, help?: string, error?: string) {
  const ids = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

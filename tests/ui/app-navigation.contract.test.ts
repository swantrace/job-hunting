import { describe, expect, test } from 'bun:test'
import { resolveActiveNavPath } from '../../app/components/layout/AppNavigation'

describe('app navigation active path', () => {
  test('highlights only Import jobs for /applications/import', () => {
    expect(resolveActiveNavPath('/applications/import')).toBe('/applications/import')
  })

  test('highlights Applications for a specific application', () => {
    expect(resolveActiveNavPath('/applications')).toBe('/applications')
    expect(resolveActiveNavPath('/applications/7')).toBe('/applications')
  })

  test('highlights the dashboard only for the root path', () => {
    expect(resolveActiveNavPath('/')).toBe('/')
  })

  test('distinguishes career pages and other top-level links', () => {
    expect(resolveActiveNavPath('/career-documents')).toBe('/career-documents')
    expect(resolveActiveNavPath('/career-growth')).toBe('/career-growth')
    expect(resolveActiveNavPath('/import')).toBe('/import')
  })
})

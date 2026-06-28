import { describe, expect, it } from 'vitest'

import { formatCitationPage } from '@/utils/citationPage'

describe('formatCitationPage', () => {
  it('converts zero-based page indexes to user-facing page numbers', () => {
    expect(formatCitationPage({ page_idx: 1, page_range: '' })).toBe('2')
    expect(formatCitationPage({ page_idx: 53, page_range: '53-54' })).toBe('54-55')
    expect(formatCitationPage({ page_idx: null, page_range: '' })).toBe('-')
  })
})

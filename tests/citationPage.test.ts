import { describe, expect, it } from 'vitest'

import { formatCitationChunk, formatCitationPage } from '@/utils/citationPage'

describe('formatCitationPage', () => {
  it('converts zero-based page indexes to user-facing page numbers', () => {
    expect(formatCitationPage({ page_idx: 1, page_range: '' })).toBe('2')
    expect(formatCitationPage({ page_idx: 53, page_range: '53-54' })).toBe('54-55')
    expect(formatCitationPage({ page_idx: null, page_range: '' })).toBe('-')
  })
})

describe('formatCitationChunk', () => {
  it('shows backend chunk ids as compact user-facing labels', () => {
    expect(formatCitationChunk('doc_724388702c6990be_chunk_66')).toBe('chunk 66')
    expect(formatCitationChunk('chunk-7')).toBe('chunk 7')
    expect(formatCitationChunk('42')).toBe('chunk 42')
  })

  it('keeps unknown chunk ids visible', () => {
    expect(formatCitationChunk('chunk-old')).toBe('chunk-old')
    expect(formatCitationChunk('')).toBe('-')
  })
})

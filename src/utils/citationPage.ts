import type { Citation } from '@/types/qa'

function toDisplayPage(value: string | number): number | null {
  const page = Number(value)
  return Number.isInteger(page) && page >= 0 ? page + 1 : null
}

export function formatCitationPage(citation: Pick<Citation, 'page_idx' | 'page_range'>): string {
  const range = String(citation.page_range || '').trim()
  const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(range)
  if (rangeMatch) {
    const start = toDisplayPage(rangeMatch[1])
    const end = toDisplayPage(rangeMatch[2])
    if (start !== null && end !== null) {
      return start === end ? String(start) : `${start}-${end}`
    }
  }

  const page = citation.page_idx === null ? null : toDisplayPage(citation.page_idx)
  return page === null ? '-' : String(page)
}

export function formatCitationChunk(chunkId: string): string {
  const value = String(chunkId || '').trim()
  if (!value) return '-'

  const numericId = /^(\d+)$/.exec(value)
  if (numericId) return 'chunk ' + numericId[1]

  const chunkMatch = /(?:^|[_-])chunk[_-]?(\d+)$/i.exec(value)
  if (chunkMatch) return 'chunk ' + chunkMatch[1]

  return value
}

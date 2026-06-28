import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { askQuestionStream } from '@/api/client'
import { useQaStore } from '@/stores/qaStore'
import type { AskResponse } from '@/types/qa'

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 500
    payload = { message: 'mock error' }
  },
  askQuestionStream: vi.fn(),
  getDocumentTask: vi.fn(),
  getSession: vi.fn(),
  indexDocument: vi.fn(),
  startUploadDocument: vi.fn(),
}))

const resolvedResponse: AskResponse = {
  answer: '新的回答 [C1]',
  decision: 'answer',
  query_type: 'fact_lookup',
  confidence: 1,
  session_id: 'session-new',
  citations: [],
  retrieval: {
    collection_name: 'default',
    trace_id: 'trace-new',
    cache_hit: false,
    evidence_count: 1,
    citation_count: 1,
    repository_collection_count: 878,
    workflow_runner: 'langgraph',
  },
}

describe('qaStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(askQuestionStream).mockReset()
  })

  it('starts with an empty question so the composer shows guidance text', () => {
    const store = useQaStore()

    expect(store.question).toBe('')
  })

  it('clears stale answer state before sending a new ask request', async () => {
    let resolveAsk!: (response: AskResponse) => void
    vi.mocked(askQuestionStream).mockReturnValue(
      new Promise<AskResponse>((resolve) => {
        resolveAsk = resolve
      }),
    )

    const store = useQaStore()
    store.question = '新的问题'
    store.currentResponse = { ...resolvedResponse, answer: '旧回答 [C1]' }
    store.debugResponse = { ...resolvedResponse, answer: '旧调试回答 [C1]' }
    store.session = { session_id: 'session-old', messages: [], retrieval_traces: [] }
    store.elapsedMs = 64100

    const pending = store.ask(false)

    expect(store.loading).toBe(true)
    expect(store.currentResponse).toBeNull()
    expect(store.debugResponse).toBeNull()
    expect(store.session).toBeNull()
    expect(store.elapsedMs).toBe(0)

    resolveAsk(resolvedResponse)
    await pending

    expect(store.currentResponse?.answer).toBe('新的回答 [C1]')
  })

  it('uses the include_debug toggle when ask is called from the main composer', async () => {
    vi.mocked(askQuestionStream).mockResolvedValue(resolvedResponse)

    const store = useQaStore()
    store.question = '需要调试 trace 的问题'
    store.includeDebug = true

    await store.ask()

    expect(askQuestionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '需要调试 trace 的问题',
        include_debug: true,
      }),
      expect.any(Object),
    )
    expect(store.debugResponse).toEqual(resolvedResponse)
  })
})

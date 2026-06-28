import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, askQuestion } from '@/api/client'

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts ask payload to backend /qa/ask', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          answer: '上海芯导简介 [C1]',
          decision: 'answer',
          query_type: 'summarization',
          confidence: 1,
          session_id: 'session-1',
          citations: [],
          retrieval: {
            collection_name: 'default',
            trace_id: 'trace-1',
            cache_hit: false,
            evidence_count: 0,
            citation_count: 0,
            repository_collection_count: 878,
            workflow_runner: 'langgraph',
          },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await askQuestion({
      question: '告诉我上海芯导公司简介和历史沿革',
      session_id: '',
      collection_name: 'default',
      top_k: 5,
      expand_query_num: 3,
      enable_cache: true,
      include_debug: false,
    })

    expect(fetchMock).toHaveBeenCalledWith('/qa/ask', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      collection_name: 'default',
      include_debug: false,
    })
    expect(response.answer).toContain('[C1]')
  })

  it('maps backend business error payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            code: 'NOT_FOUND',
            message: 'Collection not found: missing',
            detail: { collection_name: 'missing' },
          }),
      }),
    )

    await expect(
      askQuestion({
        question: '测试',
        session_id: '',
        collection_name: 'missing',
        top_k: 5,
        expand_query_num: 3,
        enable_cache: true,
      }),
    ).rejects.toMatchObject({
      status: 404,
      payload: expect.objectContaining({ code: 'NOT_FOUND' }),
    })
  })
})

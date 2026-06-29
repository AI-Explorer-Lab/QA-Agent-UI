import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, askQuestion, askQuestionStream, deleteSession, listSessions } from '@/api/client'

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
      use_llm_intent_slot: false,
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
        use_llm_intent_slot: false,
      }),
    ).rejects.toMatchObject({
      status: 404,
      payload: expect.objectContaining({ code: 'NOT_FOUND' }),
    })
  })

  it('normalizes include_debug stream responses so cache metadata still renders', async () => {
    const encoder = new TextEncoder()
    const debugPayload = {
      answer: 'cached answer [C1]',
      decision: 'answer',
      query_type: 'table_qa',
      confidence: 1,
      session_id: 'session-debug',
      citations: [{ citation_id: 'C1' }],
      evidence: [{ chunk_id: 'chunk-1' }],
      retrieval_trace: {
        collection_name: 'xindao',
        trace_id: 'trace-debug',
        cache_hit: true,
        workflow_runner: 'langgraph',
        workflow_duration_ms: 7100,
        repository_collection_count: 878,
        progress_stages: [{ phase: 'answer_generation', status: 'completed', duration_ms: 1, cache_hit: true }],
        llm: { answer_cache_hit: true },
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify(debugPayload)}\n\n`))
            controller.close()
          },
        }),
      }),
    )

    const response = await askQuestionStream({
      question: 'cache debug?',
      session_id: '',
      collection_name: 'xindao',
      top_k: 5,
      expand_query_num: 3,
      enable_cache: true,
      use_llm_intent_slot: false,
      include_debug: true,
    })

    expect(response.retrieval.cache_hit).toBe(true)
    expect(response.retrieval.collection_name).toBe('xindao')
    expect(response.retrieval.trace_id).toBe('trace-debug')
    expect(response.retrieval.evidence_count).toBe(1)
    expect(response.retrieval.citation_count).toBe(1)
    expect(response.retrieval.progress_stages?.[0]).toMatchObject({ cache_hit: true })
  })

  it('lists sessions for the selected collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          collection_name: 'default',
          sessions: [{ session_id: 's1', title: '季度收入追问', turn_count: 3 }],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await listSessions('default', 20)

    expect(fetchMock).toHaveBeenCalledWith('/qa/sessions?collection_name=default&limit=20', expect.any(Object))
    expect(response.sessions[0].title).toBe('季度收入追问')
  })

  it('deletes a session by session id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          session_id: 'session-delete',
          deleted: true,
          deleted_counts: {
            qa_sessions: 1,
            qa_messages: 2,
            retrieval_traces: 1,
            evaluation_records: 1,
          },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await deleteSession('session-delete')

    expect(fetchMock).toHaveBeenCalledWith(
      '/qa/sessions/session-delete',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(response.deleted_counts.qa_sessions).toBe(1)
  })
})

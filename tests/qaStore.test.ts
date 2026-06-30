import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { askQuestionStream, deleteSession, getSession, listSessions } from '@/api/client'
import { formatSessionTitle, useQaStore } from '@/stores/qaStore'
import type { AskResponse, SessionSummary } from '@/types/qa'

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 500
    payload = { message: 'mock error' }
  },
  askQuestionStream: vi.fn(),
  deleteSession: vi.fn(),
  getDocumentTask: vi.fn(),
  getSession: vi.fn(),
  indexDocument: vi.fn(),
  listSessions: vi.fn(),
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

function sessionSummary(sessionId: string, title: string): SessionSummary {
  return {
    session_id: sessionId,
    collection_name: 'default',
    title,
    message_count: 2,
    turn_count: 1,
    updated_at: '',
    created_at: '',
    citation_count: 1,
    evidence_count: 1,
  }
}

describe('qaStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(askQuestionStream).mockReset()
    vi.mocked(deleteSession).mockReset()
    vi.mocked(getSession).mockReset()
    vi.mocked(listSessions).mockReset()
    vi.mocked(listSessions).mockResolvedValue({ collection_name: 'default', sessions: [] })
    vi.mocked(deleteSession).mockResolvedValue({
      session_id: 'session-history',
      deleted: true,
      deleted_counts: {
        qa_sessions: 1,
        qa_messages: 2,
        retrieval_traces: 1,
        evaluation_records: 0,
      },
    })
  })

  it('starts with an empty question so the composer shows guidance text', () => {
    const store = useQaStore()

    expect(store.question).toBe('')
  })

  it('uses the last user question as the session title fallback', () => {
    expect(formatSessionTitle({ title: '', last_user_question: 'What is 2025 revenue?' })).toBe(
      'What is 2025 revenue?',
    )
    expect(formatSessionTitle({ title: 'Quarterly revenue', last_user_question: 'What is 2025 revenue?' })).toBe(
      'Quarterly revenue',
    )
    expect(formatSessionTitle({ title: '', last_user_question: '   ' })).toBe('新对话')
  })

  it('loads additional session pages without replacing existing sessions', async () => {
    vi.mocked(listSessions)
      .mockResolvedValueOnce({
        collection_name: 'default',
        sessions: [sessionSummary('s1', '第一页')],
        has_more: true,
        next_offset: 1,
      })
      .mockResolvedValueOnce({
        collection_name: 'default',
        sessions: [sessionSummary('s2', '第二页')],
        has_more: false,
        next_offset: null,
      })

    const store = useQaStore()
    await store.refreshSessions()
    await store.loadMoreSessions()

    expect(listSessions).toHaveBeenNthCalledWith(1, 'default', 40)
    expect(listSessions).toHaveBeenNthCalledWith(2, 'default', 40, 1)
    expect(store.sessions.map((session) => session.session_id)).toEqual(['s1', 's2'])
    expect(store.sessionsHasMore).toBe(false)
  })

  it('keeps the active transcript and appends a new pending turn before sending ask', async () => {
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
    store.conversationMessages = [
      { id: 'u-old', role: 'user', content: '旧问题' },
      { id: 'a-old', role: 'assistant', content: '旧回答' },
    ]
    store.elapsedMs = 64100

    const pending = store.ask(false)

    expect(store.loading).toBe(true)
    expect(store.currentResponse).toBeNull()
    expect(store.debugResponse).toBeNull()
    expect(store.session?.session_id).toBe('session-old')
    expect(store.elapsedMs).toBe(0)
    expect(store.conversationMessages.map((message) => message.content)).toEqual(['旧问题', '旧回答', '新的问题', ''])

    resolveAsk(resolvedResponse)
    await pending

    expect(store.currentResponse?.answer).toBe('新的回答 [C1]')
    expect(store.conversationMessages.at(-1)?.content).toBe('新的回答 [C1]')
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

  it('sends the LLM intent slot flag when deep thinking is enabled', async () => {
    vi.mocked(askQuestionStream).mockResolvedValue(resolvedResponse)

    const store = useQaStore()
    store.question = '表格中2025年营业收入是多少，出处在哪里？'
    store.useLlmIntentSlot = true

    await store.ask()

    expect(askQuestionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '表格中2025年营业收入是多少，出处在哪里？',
        use_llm_intent_slot: true,
      }),
      expect.any(Object),
    )
  })

  it('hydrates answer and citations when an existing session is selected', async () => {
    vi.mocked(getSession).mockResolvedValue({
      session_id: 'session-history',
      collection_name: 'default',
      metadata: {
        conversation_focus: {
          active_topic: '2025年分季度财务数据',
        },
      },
      messages: [
        { message_id: 'u1', role: 'user', content: '四个季度收入分别是多少？' },
        {
          message_id: 'a1',
          role: 'assistant',
          content: '第一季度到第四季度收入如下 [C1]',
          metadata: {
            decision: 'answer',
            query_type: 'table_qa',
            confidence: 0.98,
            citations: [
              {
                citation_id: 'C1',
                chunk_id: 'chunk-1',
                doc_id: 'doc-1',
                source_name: 'xindao.pdf',
                page_idx: 9,
                page_range: '9',
                heading_path: '主要财务数据',
                quote: '营业收入',
                confidence: 1,
              },
            ],
            evidence: [{ chunk_id: 'chunk-1' }],
            retrieval_trace_id: 'trace-history',
          },
        },
      ],
      retrieval_traces: [
        {
          trace_id: 'trace-history',
          collection_name: 'default',
          cache_hit: true,
          workflow_runner: 'langgraph',
          workflow_duration_ms: 6800,
          selected_candidates: [{ chunk_id: 'chunk-1' }],
        },
      ],
    })

    const store = useQaStore()
    await store.selectSession('session-history')

    expect(store.sessionId).toBe('session-history')
    expect(store.question).toBe('')
    expect(store.currentResponse?.answer).toContain('第一季度到第四季度收入')
    expect(store.conversationMessages).toHaveLength(2)
    expect(store.conversationMessages[0]).toMatchObject({ id: 'u1', role: 'user', content: '四个季度收入分别是多少？' })
    expect(store.conversationMessages[1]).toMatchObject({ id: 'a1', role: 'assistant' })
    expect(store.conversationMessages[1].response?.query_type).toBe('table_qa')
    expect(store.citations[0].citation_id).toBe('C1')
    expect(store.retrieval?.cache_hit).toBe(true)
    expect(store.conversationFocus?.active_topic).toBe('2025年分季度财务数据')
  })

  it('activates a historical assistant message and swaps the citation rail source', () => {
    const oldResponse: AskResponse = {
      ...resolvedResponse,
      answer: 'old answer [C1]',
      citations: [
        {
          citation_id: 'C1',
          chunk_id: 'chunk-old',
          doc_id: 'doc-old',
          page_idx: 1,
          page_range: '1',
          heading_path: 'old',
          quote: 'old quote',
          confidence: 1,
        },
      ],
      retrieval: {
        ...resolvedResponse.retrieval,
        trace_id: 'trace-old',
        evidence_count: 1,
        citation_count: 1,
      },
    }
    const newResponse: AskResponse = {
      ...resolvedResponse,
      answer: 'new answer [C2]',
      citations: [
        {
          citation_id: 'C2',
          chunk_id: 'chunk-new',
          doc_id: 'doc-new',
          page_idx: 2,
          page_range: '2',
          heading_path: 'new',
          quote: 'new quote',
          confidence: 1,
        },
      ],
      retrieval: {
        ...resolvedResponse.retrieval,
        trace_id: 'trace-new',
        evidence_count: 1,
        citation_count: 1,
      },
    }

    const store = useQaStore()
    store.currentResponse = newResponse
    store.selectedCitationId = 'C2'
    store.activeAssistantMessageId = 'a2'
    store.conversationMessages = [
      { id: 'u1', role: 'user', content: 'old question' },
      { id: 'a1', role: 'assistant', content: oldResponse.answer, response: oldResponse, retrieval: oldResponse.retrieval },
      { id: 'u2', role: 'user', content: 'new question' },
      { id: 'a2', role: 'assistant', content: newResponse.answer, response: newResponse, retrieval: newResponse.retrieval },
    ]

    store.activateConversationMessage('a1', 'C1')

    expect(store.activeAssistantMessageId).toBe('a1')
    expect(store.currentResponse?.answer).toBe('old answer [C1]')
    expect(store.citations.map((citation) => citation.citation_id)).toEqual(['C1'])
    expect(store.retrieval?.trace_id).toBe('trace-old')
    expect(store.selectedCitationId).toBe('C1')
  })

  it('keeps each same-second turn in user then assistant order when session rows arrive swapped', async () => {
    vi.mocked(getSession).mockResolvedValue({
      session_id: 'session-swapped',
      collection_name: 'default',
      messages: [
        {
          message_id: 'a1',
          timestamp: '2026-06-29T10:58:12.000Z',
          role: 'assistant',
          content: '你好！我是可信问答助手。',
          metadata: {
            decision: 'answer',
            query_type: 'ambiguous_query',
            confidence: 1,
            citations: [],
            evidence: [],
            retrieval_trace_id: 'trace-swapped',
          },
        },
        {
          message_id: 'u1',
          timestamp: '2026-06-29T10:58:12.000Z',
          role: 'user',
          content: '你好',
        },
      ],
      retrieval_traces: [{ trace_id: 'trace-swapped', collection_name: 'default' }],
    })

    const store = useQaStore()
    await store.selectSession('session-swapped')

    expect(store.conversationMessages.map((message) => `${message.role}:${message.content}`)).toEqual([
      'user:你好',
      'assistant:你好！我是可信问答助手。',
    ])
  })

  it('deletes the active session and clears linked answer state', async () => {
    const store = useQaStore()
    store.sessionId = 'session-history'
    store.currentResponse = resolvedResponse
    store.session = { session_id: 'session-history', messages: [], retrieval_traces: [] }
    store.sessions = [
      {
        session_id: 'session-history',
        collection_name: 'default',
        title: '季度收入追问',
        message_count: 2,
        turn_count: 1,
        updated_at: '',
        created_at: '',
        citation_count: 1,
        evidence_count: 1,
      },
    ]

    await store.deleteCurrentSession()

    expect(deleteSession).toHaveBeenCalledWith('session-history')
    expect(store.sessionId).toBe('')
    expect(store.currentResponse).toBeNull()
    expect(store.sessions).toEqual([])
  })

  it('deletes an inactive session without switching the active conversation', async () => {
    const store = useQaStore()
    store.sessionId = 'session-active'
    store.currentResponse = resolvedResponse
    store.conversationMessages = [{ id: 'u-active', role: 'user', content: 'active question' }]
    store.sessionsNextOffset = 2
    store.sessions = [sessionSummary('session-active', '当前会话'), sessionSummary('session-delete', '待删除会话')]

    await store.deleteSessionById('session-delete')

    expect(deleteSession).toHaveBeenCalledWith('session-delete')
    expect(store.sessionId).toBe('session-active')
    expect(store.currentResponse).toEqual(resolvedResponse)
    expect(store.conversationMessages).toEqual([{ id: 'u-active', role: 'user', content: 'active question' }])
    expect(store.sessions.map((session) => session.session_id)).toEqual(['session-active'])
    expect(store.sessionsNextOffset).toBe(1)
  })
})

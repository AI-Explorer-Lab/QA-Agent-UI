import { defineStore } from 'pinia'

import {
  ApiError,
  askQuestionStream,
  deleteSession,
  getDocumentTask,
  getSession,
  indexDocument,
  listSessions,
  startUploadDocument,
} from '@/api/client'
import type {
  AskPayload,
  AskResponse,
  AskStreamStatus,
  Citation,
  CompactRetrieval,
  ConversationDisplayMessage,
  DisplayStreamStatus,
  DocumentTaskResponse,
  IndexPayload,
  IndexResponse,
  ProgressStage,
  SessionListResponse,
  SessionMessage,
  SessionResponse,
  SessionSummary,
  SessionTrace,
  UploadPayload,
} from '@/types/qa'

const SESSION_PAGE_SIZE = 40

interface WorkspaceState {
  collectionName: string
  uploadCollectionName: string
  question: string
  sessionId: string
  topK: number
  expandQueryNum: number
  enableCache: boolean
  useLlmIntentSlot: boolean
  includeDebug: boolean
  currentResponse: AskResponse | null
  debugResponse: AskResponse | null
  session: SessionResponse | null
  indexingResult: IndexResponse | null
  indexingTask: DocumentTaskResponse | null
  loading: boolean
  loadingMessage: string
  streamStatuses: DisplayStreamStatus[]
  selectedCitationId: string
  activeAssistantMessageId: string
  indexing: boolean
  error: string
  elapsedMs: number
  lastPayload: AskPayload | null
  askRunId: number
  debugActiveTab: string
  conversationMessages: ConversationDisplayMessage[]
  sessions: SessionSummary[]
  sessionsLoading: boolean
  sessionsLoadingMore: boolean
  sessionsHasMore: boolean
  sessionsNextOffset: number
  sessionLoading: boolean
  sessionSearch: string
  sessionsError: string
  deletingSessionId: string
}

export const useQaStore = defineStore('qa', {
  state: (): WorkspaceState => ({
    collectionName: 'default',
    uploadCollectionName: 'default',
    question: '',
    sessionId: '',
    topK: 5,
    expandQueryNum: 3,
    enableCache: true,
    useLlmIntentSlot: false,
    includeDebug: false,
    currentResponse: null,
    debugResponse: null,
    session: null,
    indexingResult: null,
    indexingTask: null,
    loading: false,
    loadingMessage: '',
    streamStatuses: [],
    selectedCitationId: '',
    activeAssistantMessageId: '',
    indexing: false,
    error: '',
    elapsedMs: 0,
    lastPayload: null,
    askRunId: 0,
    debugActiveTab: 'retrieval',
    conversationMessages: [],
    sessions: [],
    sessionsLoading: false,
    sessionsLoadingMore: false,
    sessionsHasMore: true,
    sessionsNextOffset: 0,
    sessionLoading: false,
    sessionSearch: '',
    sessionsError: '',
    deletingSessionId: '',
  }),
  getters: {
    citations: (state) => state.currentResponse?.citations ?? [],
    retrieval: (state) => {
      if (!state.currentResponse || !('retrieval' in state.currentResponse)) return null
      return state.currentResponse.retrieval
    },
    hasAnswer: (state) => Boolean(state.currentResponse?.answer),
    displayElapsedMs: (state) => {
      const backendElapsedMs = Number(state.currentResponse?.retrieval?.workflow_duration_ms || 0)
      return backendElapsedMs > 0 ? backendElapsedMs : state.elapsedMs
    },
    filteredSessions: (state) => {
      const keyword = state.sessionSearch.trim().toLowerCase()
      if (!keyword) return state.sessions
      return state.sessions.filter((session) => {
        const haystack = [
          session.title,
          session.last_user_question,
          session.last_query_type,
          session.turn_type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(keyword)
      })
    },
    activeSessionSummary: (state) => state.sessions.find((session) => session.session_id === state.sessionId) ?? null,
    activeQueryType: (state) => {
      const summary = state.sessions.find((session) => session.session_id === state.sessionId)
      return summary?.last_query_type || state.currentResponse?.query_type || '未提问'
    },
    activeEvidenceCount: (state) => {
      const summary = state.sessions.find((session) => session.session_id === state.sessionId)
      return summary?.evidence_count ?? state.currentResponse?.retrieval?.evidence_count ?? 0
    },
    conversationFocus: (state) => {
      const summary = state.sessions.find((session) => session.session_id === state.sessionId)
      const sessionFocus = state.session?.metadata?.conversation_focus
      if (isRecord(sessionFocus)) return sessionFocus
      if (isRecord(summary?.conversation_focus)) return summary.conversation_focus
      return null
    },
  },
  actions: {
    clearAnswerState() {
      this.currentResponse = null
      this.debugResponse = null
      this.session = null
      this.conversationMessages = []
      this.elapsedMs = 0
      this.streamStatuses = []
      this.selectedCitationId = ''
      this.activeAssistantMessageId = ''
    },
    clearActiveResponseState() {
      this.currentResponse = null
      this.debugResponse = null
      this.elapsedMs = 0
      this.streamStatuses = []
      this.selectedCitationId = ''
      this.activeAssistantMessageId = ''
    },
    startNewSession() {
      this.sessionId = ''
      this.question = ''
      this.error = ''
      this.clearAnswerState()
    },
    handleCollectionChanged() {
      this.startNewSession()
      void this.refreshSessions()
    },
    setSelectedCitation(citationId: string) {
      this.selectedCitationId = citationId
    },
    activateConversationMessage(messageId: string, citationId?: string) {
      const message = this.conversationMessages.find(
        (item) => item.id === messageId && item.role === 'assistant' && item.response,
      )
      if (!message?.response) return

      this.activeAssistantMessageId = message.id
      this.currentResponse = message.response
      const citations = message.response.citations ?? []
      const requestedCitationId = citationId?.trim() || ''
      const hasRequestedCitation = citations.some((citation) => citation.citation_id === requestedCitationId)
      const keepsCurrentCitation = citations.some((citation) => citation.citation_id === this.selectedCitationId)
      this.selectedCitationId = hasRequestedCitation
        ? requestedCitationId
        : keepsCurrentCitation
          ? this.selectedCitationId
          : citations[0]?.citation_id || ''
    },
    buildPayload(includeDebug?: boolean): AskPayload {
      return {
        question: this.question.trim(),
        session_id: this.sessionId,
        collection_name: this.collectionName.trim(),
        top_k: this.topK,
        expand_query_num: this.expandQueryNum,
        enable_cache: this.enableCache,
        use_llm_intent_slot: this.useLlmIntentSlot,
        include_debug: includeDebug ?? this.includeDebug,
      }
    },
    async ask(includeDebug?: boolean) {
      const runId = this.askRunId + 1
      this.askRunId = runId
      this.error = ''
      const shouldIncludeDebug = includeDebug ?? this.includeDebug
      const payload = this.buildPayload(shouldIncludeDebug)
      const userMessageId = `local-user-${runId}`
      const assistantMessageId = `local-assistant-${runId}`
      this.clearActiveResponseState()
      this.appendLocalUserMessage(userMessageId, payload.question)
      this.appendLocalAssistantMessage(assistantMessageId)
      this.question = ''
      this.loading = true
      this.loadingMessage = '正在生成答案，请稍等'
      const startedAt = performance.now()
      this.lastPayload = payload
      try {
        const response = await askQuestionStream(payload, {
          onStatus: (status) => {
            if (this.askRunId !== runId) return
            this.recordStreamStatus(status)
          },
        })
        if (this.askRunId !== runId) return
        if (shouldIncludeDebug) {
          this.debugResponse = response
        }
        this.sessionId = response.session_id || this.sessionId
        await this.renderAnswer(response, runId, assistantMessageId)
        this.completeStreamStatuses()
        await this.refreshSessions()
        await this.refreshActiveSessionSnapshot(runId)
      } catch (error) {
        if (this.askRunId !== runId) return
        this.failStreamStatuses()
        this.error = formatError(error)
        this.markLocalAssistantFailed(assistantMessageId, this.error)
      } finally {
        if (this.askRunId !== runId) return
        this.elapsedMs = Math.round(performance.now() - startedAt)
        this.loading = false
        this.loadingMessage = ''
      }
    },
    async loadDebug() {
      await this.ask(true)
    },
    recordStreamStatus(status: AskStreamStatus) {
      const stage = normalizeStage(status.stage)
      const now = performance.now()
      const message = normalizeStreamMessage(status.message)
      this.loadingMessage = message
      if (typeof status.elapsed_ms === 'number' && status.elapsed_ms >= 0) {
        this.elapsedMs = Math.round(status.elapsed_ms)
      }

      const current = this.streamStatuses.find((item) => item.stage === stage)
      for (const item of this.streamStatuses) {
        if (item.stage !== stage && item.status === 'running') {
          item.status = 'completed'
          item.completed_at = now
          item.duration_ms = item.duration_ms || 0
          item.timed = item.timed ?? false
        }
      }

      if (current) {
        current.message = message
        current.status = status.status || 'running'
        current.collection_name = status.collection_name || current.collection_name
        current.elapsed_ms = status.elapsed_ms ?? current.elapsed_ms
        current.duration_ms = Number(status.duration_ms ?? current.duration_ms ?? 0)
        current.timed = status.timed ?? current.timed ?? false
        current.cache_hit = status.cache_hit ?? current.cache_hit
        current.evidence_count = status.evidence_count ?? current.evidence_count
        if (current.status === 'completed' && !current.completed_at) {
          current.completed_at = now
        }
        return
      }

      this.streamStatuses.push({
        ...status,
        stage,
        label: stageLabel(stage),
        message,
        status: status.status || 'running',
        duration_ms: Number(status.duration_ms || 0),
        timed: status.timed ?? false,
        started_at: now,
      })
    },
    completeStreamStatuses() {
      const now = performance.now()
      for (const item of this.streamStatuses) {
        if (item.status === 'running' || item.status === 'pending') {
          item.status = 'completed'
          item.duration_ms = item.duration_ms || 0
          item.timed = item.timed ?? false
        }
        if (!item.completed_at) {
          item.completed_at = now
        }
      }
    },
    failStreamStatuses() {
      const now = performance.now()
      for (const item of this.streamStatuses) {
        if (item.status === 'running' || item.status === 'pending') {
          item.status = 'failed'
          item.completed_at = now
          item.duration_ms = Math.max(0, Math.round(now - item.started_at))
        }
      }
    },
    async renderAnswer(response: AskResponse, runId?: number, assistantMessageId?: string) {
      const activeRunId = runId ?? this.askRunId
      const fullAnswer = response.answer || ''
      this.currentResponse = { ...response, answer: '' }
      this.updateLocalAssistantMessage(assistantMessageId, { ...response, answer: '' }, true)
      this.recordStreamStatus({
        stage: 'client_answer_stream',
        status: 'running',
        message: '正在流式输出答案',
        elapsed_ms: this.elapsedMs,
      })
      this.loadingMessage = '正在流式输出答案'
      if (!fullAnswer) return

      const targetFrames = Math.min(160, Math.max(36, Math.ceil(fullAnswer.length / 2)))
      const step = Math.max(1, Math.ceil(fullAnswer.length / targetFrames))
      for (let index = step; index < fullAnswer.length; index += step) {
        if (this.askRunId !== activeRunId) return
        const partialResponse = { ...response, answer: fullAnswer.slice(0, index) }
        this.currentResponse = partialResponse
        this.updateLocalAssistantMessage(assistantMessageId, partialResponse, true)
        await sleep(24)
      }
      if (this.askRunId !== activeRunId) return
      this.currentResponse = response
      this.updateLocalAssistantMessage(assistantMessageId, response, false)
    },
    async loadSession() {
      if (!this.sessionId) return
      this.error = ''
      try {
        this.session = await getSession(this.sessionId)
      } catch (error) {
        this.error = formatError(error)
      }
    },
    async refreshSessions() {
      const collectionName = this.collectionName.trim() || 'default'
      this.sessionsLoading = true
      this.sessionsLoadingMore = false
      this.sessionsError = ''
      try {
        const response: SessionListResponse = await listSessions(collectionName, SESSION_PAGE_SIZE)
        if ((response.collection_name || collectionName) !== (this.collectionName.trim() || 'default')) return
        this.sessions = response.sessions ?? []
        this.sessionsHasMore = response.has_more ?? this.sessions.length >= SESSION_PAGE_SIZE
        this.sessionsNextOffset = response.next_offset ?? this.sessions.length
      } catch (error) {
        this.sessionsError = formatError(error)
      } finally {
        this.sessionsLoading = false
      }
    },
    async loadMoreSessions() {
      if (this.sessionsLoading || this.sessionsLoadingMore || !this.sessionsHasMore) return
      const collectionName = this.collectionName.trim() || 'default'
      const offset = this.sessionsNextOffset || this.sessions.length
      this.sessionsLoadingMore = true
      this.sessionsError = ''
      try {
        const response: SessionListResponse = await listSessions(collectionName, SESSION_PAGE_SIZE, offset)
        if ((response.collection_name || collectionName) !== (this.collectionName.trim() || 'default')) return
        const seen = new Set(this.sessions.map((session) => session.session_id))
        const nextSessions = (response.sessions ?? []).filter((session) => !seen.has(session.session_id))
        this.sessions.push(...nextSessions)
        this.sessionsHasMore = response.has_more ?? (response.sessions ?? []).length >= SESSION_PAGE_SIZE
        this.sessionsNextOffset = response.next_offset ?? offset + (response.sessions ?? []).length
      } catch (error) {
        this.sessionsError = formatError(error)
      } finally {
        this.sessionsLoadingMore = false
      }
    },
    async selectSession(sessionId: string) {
      const sid = sessionId.trim()
      if (!sid) return
      this.error = ''
      this.sessionLoading = true
      this.loading = false
      this.loadingMessage = ''
      this.askRunId += 1
      try {
        const session = await getSession(sid)
        this.sessionId = session.session_id || sid
        this.session = session
        this.question = ''
        this.hydrateFromSession(session)
      } catch (error) {
        this.error = formatError(error)
      } finally {
        this.sessionLoading = false
      }
    },
    hydrateFromSession(session: SessionResponse) {
      this.currentResponse = buildResponseFromSession(session, this.collectionName)
      this.conversationMessages = buildConversationMessagesFromSession(session, this.collectionName)
      this.debugResponse = null
      this.elapsedMs = 0
      this.streamStatuses = []
      this.activateLatestAssistantMessage()
    },
    async refreshActiveSessionSnapshot(runId?: number) {
      const activeRunId = runId ?? this.askRunId
      const sid = this.sessionId.trim()
      if (!sid) return
      try {
        const session = await getSession(sid)
        if (this.askRunId !== activeRunId) return
        if (!session?.session_id) return
        const debugResponse = this.debugResponse
        this.session = session
        this.hydrateFromSession(session)
        this.debugResponse = debugResponse
      } catch {
        // Keep the optimistic chat transcript if persisted session refresh fails.
      }
    },
    appendLocalUserMessage(id: string, content: string) {
      if (!content.trim()) return
      this.conversationMessages.push({
        id,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      })
    },
    appendLocalAssistantMessage(id: string) {
      this.conversationMessages.push({
        id,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        loading: true,
      })
      this.activeAssistantMessageId = id
    },
    updateLocalAssistantMessage(id: string | undefined, response: AskResponse, loading: boolean) {
      if (!id) return
      const message = this.conversationMessages.find((item) => item.id === id)
      if (!message) return
      message.content = response.answer || ''
      message.response = response
      message.retrieval = response.retrieval
      message.loading = loading
      message.failed = false
      this.activeAssistantMessageId = message.id
      if (!loading && response.citations?.length && !this.selectedCitationId) {
        this.selectedCitationId = response.citations[0].citation_id
      }
    },
    markLocalAssistantFailed(id: string, error: string) {
      const message = this.conversationMessages.find((item) => item.id === id)
      if (!message) return
      message.content = error || '请求失败，请检查后端服务'
      message.loading = false
      message.failed = true
    },
    activateLatestAssistantMessage() {
      const latestAssistant = [...this.conversationMessages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.response)
      if (latestAssistant?.response) {
        this.activateConversationMessage(latestAssistant.id)
        return
      }
      this.activeAssistantMessageId = ''
      this.selectedCitationId = ''
    },
    async deleteSessionById(sessionId: string) {
      const sid = sessionId.trim()
      if (!sid || this.deletingSessionId) return null
      this.error = ''
      this.sessionsError = ''
      this.deletingSessionId = sid
      try {
        const result = await deleteSession(sid)
        const previousLength = this.sessions.length
        this.sessions = this.sessions.filter((session) => session.session_id !== sid)
        if (this.sessions.length < previousLength) {
          this.sessionsNextOffset = Math.max(0, this.sessionsNextOffset - 1)
        }
        if (this.sessionId === sid) {
          this.startNewSession()
        }
        return result
      } catch (error) {
        this.sessionsError = formatError(error)
        return null
      } finally {
        this.deletingSessionId = ''
      }
    },
    async deleteCurrentSession() {
      return this.deleteSessionById(this.sessionId)
    },
    async indexPdf(payload: IndexPayload): Promise<IndexResponse | null> {
      this.error = ''
      this.indexing = true
      this.indexingResult = null
      this.indexingTask = null
      try {
        const result = await indexDocument(payload)
        this.indexingResult = result
        return result
      } catch (error) {
        this.error = formatError(error)
        return null
      } finally {
        this.indexing = false
      }
    },
    async uploadPdf(file: File, payload: UploadPayload): Promise<IndexResponse | null> {
      this.error = ''
      this.indexing = true
      this.indexingResult = null
      this.indexingTask = null
      try {
        const startedTask = await startUploadDocument(file, payload)
        this.indexingTask = startedTask
        const result = await this.pollIndexingTask(startedTask.task_id)
        if (result) {
          this.indexingResult = result
          this.uploadCollectionName = result.collection_name || payload.collection_name || this.uploadCollectionName
        }
        return result
      } catch (error) {
        this.error = formatError(error)
        return null
      } finally {
        this.indexing = false
      }
    },
    async pollIndexingTask(taskId: string): Promise<IndexResponse | null> {
      while (true) {
        const task = await getDocumentTask(taskId)
        this.indexingTask = task
        if (task.status === 'completed') {
          return task.result ?? null
        }
        if (task.status === 'failed') {
          throw new Error(task.error || '文档入库失败')
        }
        await sleep(1000)
      }
    },
  },
})

function formatError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.payload.detail ? ` ${JSON.stringify(error.payload.detail)}` : ''
    return `${error.payload.message || error.message}${detail}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return '请求失败，请检查后端服务'
}

export function formatSessionTitle(
  session: Pick<SessionSummary, 'title' | 'last_user_question'> | null | undefined,
  fallback = '新对话',
): string {
  const title = session?.title?.trim()
  if (title) return title

  const lastUserQuestion = session?.last_user_question?.trim()
  if (lastUserQuestion) return lastUserQuestion

  return fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function buildResponseFromSession(session: SessionResponse, fallbackCollectionName: string): AskResponse | null {
  const assistantMessage = [...(session.messages ?? [])].reverse().find((message) => message.role === 'assistant')
  if (!assistantMessage) return null
  return buildResponseFromAssistantMessage(session, assistantMessage, fallbackCollectionName)
}

function buildConversationMessagesFromSession(
  session: SessionResponse,
  fallbackCollectionName: string,
): ConversationDisplayMessage[] {
  return normalizeSessionMessageOrder(
    (session.messages ?? []).filter((message) => message.role === 'user' || message.role === 'assistant'),
  )
    .map((message, index) => {
      const id = message.message_id || `${message.role}-${index}`
      if (message.role === 'assistant') {
        const response = buildResponseFromAssistantMessage(session, message, fallbackCollectionName)
        return {
          id,
          role: 'assistant',
          content: message.content || '',
          timestamp: message.timestamp,
          response,
          retrieval: response?.retrieval ?? null,
        }
      }
      return {
        id,
        role: 'user',
        content: message.content || '',
        timestamp: message.timestamp,
      }
    })
}

function normalizeSessionMessageOrder(messages: SessionMessage[]): SessionMessage[] {
  const ordered = [...messages]
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index]
    const next = ordered[index + 1]
    if (current.role === 'assistant' && next.role === 'user' && sameTimestampSecond(current.timestamp, next.timestamp)) {
      ordered[index] = next
      ordered[index + 1] = current
      index += 1
    }
  }
  return ordered
}

function sameTimestampSecond(left?: string, right?: string): boolean {
  const leftSecond = timestampSecond(left)
  const rightSecond = timestampSecond(right)
  return leftSecond !== null && leftSecond === rightSecond
}

function timestampSecond(value?: string): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.floor(time / 1000)
}

function buildResponseFromAssistantMessage(
  session: SessionResponse,
  assistantMessage: SessionMessage,
  fallbackCollectionName: string,
): AskResponse {
  const metadata = isRecord(assistantMessage.metadata) ? assistantMessage.metadata : {}
  const citations = toCitationList(metadata.citations)
  const evidence = Array.isArray(metadata.evidence) ? metadata.evidence : []
  const traceId = stringValue(metadata.retrieval_trace_id)
  const trace = findSessionTrace(session.retrieval_traces ?? [], traceId)
  const retrieval = buildRetrieval(trace, {
    collectionName: stringValue(session.collection_name) || fallbackCollectionName,
    traceId,
    evidenceCount: evidence.length,
    citationCount: citations.length,
  })

  return {
    answer: assistantMessage.content || '',
    decision: normalizeDecision(metadata.decision),
    query_type: stringValue(metadata.query_type),
    confidence: numberValue(metadata.confidence),
    session_id: session.session_id,
    citations,
    retrieval,
  }
}

function findSessionTrace(traces: SessionTrace[], traceId: string): SessionTrace | null {
  if (traceId) {
    const matched = traces.find((trace) => stringValue(trace.trace_id) === traceId)
    if (matched) return matched
  }
  return traces.length ? traces[traces.length - 1] : null
}

function buildRetrieval(
  trace: SessionTrace | null,
  fallback: { collectionName: string; traceId: string; evidenceCount: number; citationCount: number },
): CompactRetrieval {
  const llmTrace = isRecord(trace?.llm) ? trace.llm : {}
  const progressStages = Array.isArray(trace?.progress_stages) ? (trace.progress_stages as ProgressStage[]) : []
  const selectedCandidates = Array.isArray(trace?.selected_candidates) ? trace.selected_candidates : []
  return {
    collection_name: stringValue(trace?.collection_name) || fallback.collectionName || 'default',
    trace_id: stringValue(trace?.trace_id) || fallback.traceId,
    cache_hit: booleanValue(trace?.cache_hit),
    query_expansion_cache_hit: booleanValue(trace?.query_expansion_cache_hit),
    query_expansion_skipped: stringValue(trace?.query_expansion_skipped),
    llm_query_expansion_used: booleanValue(trace?.llm_query_expansion_used),
    llm_answer_cache_hit: booleanValue(llmTrace.answer_cache_hit),
    final_response_cache_hit: booleanValue(trace?.final_response_cache_hit),
    evidence_count: fallback.evidenceCount || selectedCandidates.length,
    citation_count: fallback.citationCount,
    repository_collection_count: numberValue(trace?.repository_collection_count),
    workflow_runner: stringValue(trace?.workflow_runner),
    workflow_duration_ms: numberValue(trace?.workflow_duration_ms),
    progress_stages: progressStages,
  }
}

function toCitationList(value: unknown): Citation[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item) => ({
    citation_id: stringValue(item.citation_id),
    chunk_id: stringValue(item.chunk_id),
    doc_id: stringValue(item.doc_id),
    source_name: stringValue(item.source_name),
    doc_source: stringValue(item.doc_source),
    collection_name: stringValue(item.collection_name),
    page_idx: item.page_idx === null || item.page_idx === undefined ? null : numberValue(item.page_idx),
    page_range: stringValue(item.page_range),
    heading_path: stringValue(item.heading_path),
    quote: stringValue(item.quote),
    confidence: numberValue(item.confidence),
  }))
}

function normalizeDecision(value: unknown): 'answer' | 'clarify' | 'refuse' {
  const decision = stringValue(value)
  if (decision === 'clarify' || decision === 'refuse') return decision
  return 'answer'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function numberValue(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return Boolean(value)
}

function normalizeStage(stage?: string): string {
  return stage?.trim() || 'answer_generation'
}

function normalizeStreamMessage(message?: string): string {
  const text = String(message || '').trim()
  if (!text || /^\?+$/.test(text)) return '正在生成答案，请稍等'
  if (/^\?{3,}/.test(text) && !/[\u4e00-\u9fa5A-Za-z0-9]/.test(text)) return '正在生成答案，请稍等'
  return text
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    load_session: '会话',
    conversation_context: '上下文',
    intent_slot_understanding_agent: '意图槽位',
    intent_understanding_agent: '意图',
    slot_filling_agent: '槽位',
    select_skill_from_registry: '技能路由',
    clarify_gate: '澄清',
    parallel_hybrid_retrieval: '检索',
    evidence_decision: '证据',
    retry_retrieval: '重试',
    answer_generation: '回答',
    client_answer_stream: '输出',
  }
  return labels[stage] || stage
}

import { defineStore } from 'pinia'

import { ApiError, askQuestionStream, getDocumentTask, getSession, indexDocument, startUploadDocument } from '@/api/client'
import type {
  AskPayload,
  AskResponse,
  AskStreamStatus,
  DisplayStreamStatus,
  DocumentTaskResponse,
  IndexPayload,
  IndexResponse,
  SessionResponse,
  UploadPayload,
} from '@/types/qa'

interface WorkspaceState {
  collectionName: string
  question: string
  sessionId: string
  topK: number
  expandQueryNum: number
  enableCache: boolean
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
  indexing: boolean
  error: string
  elapsedMs: number
  lastPayload: AskPayload | null
  askRunId: number
  debugActiveTab: string
}

export const useQaStore = defineStore('qa', {
  state: (): WorkspaceState => ({
    collectionName: 'default',
    question: '',
    sessionId: '',
    topK: 5,
    expandQueryNum: 3,
    enableCache: true,
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
    indexing: false,
    error: '',
    elapsedMs: 0,
    lastPayload: null,
    askRunId: 0,
    debugActiveTab: 'retrieval',
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
  },
  actions: {
    clearAnswerState() {
      this.currentResponse = null
      this.debugResponse = null
      this.session = null
      this.elapsedMs = 0
      this.streamStatuses = []
      this.selectedCitationId = ''
    },
    setSelectedCitation(citationId: string) {
      this.selectedCitationId = citationId
    },
    buildPayload(includeDebug?: boolean): AskPayload {
      return {
        question: this.question.trim(),
        session_id: this.sessionId,
        collection_name: this.collectionName.trim(),
        top_k: this.topK,
        expand_query_num: this.expandQueryNum,
        enable_cache: this.enableCache,
        include_debug: includeDebug ?? this.includeDebug,
      }
    },
    async ask(includeDebug?: boolean) {
      const runId = this.askRunId + 1
      this.askRunId = runId
      this.error = ''
      this.clearAnswerState()
      this.loading = true
      this.loadingMessage = '正在生成答案，请稍等'
      const startedAt = performance.now()
      const shouldIncludeDebug = includeDebug ?? this.includeDebug
      const payload = this.buildPayload(shouldIncludeDebug)
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
        await this.renderAnswer(response, runId)
        this.completeStreamStatuses()
      } catch (error) {
        if (this.askRunId !== runId) return
        this.failStreamStatuses()
        this.error = formatError(error)
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
    async renderAnswer(response: AskResponse, runId?: number) {
      const activeRunId = runId ?? this.askRunId
      const fullAnswer = response.answer || ''
      this.currentResponse = { ...response, answer: '' }
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
        this.currentResponse = { ...response, answer: fullAnswer.slice(0, index) }
        await sleep(24)
      }
      if (this.askRunId !== activeRunId) return
      this.currentResponse = response
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
          this.collectionName = result.collection_name || payload.collection_name || this.collectionName
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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

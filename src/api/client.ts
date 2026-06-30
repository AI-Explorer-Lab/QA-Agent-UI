import type {
  ApiErrorPayload,
  AskPayload,
  AskResponse,
  AskStreamCallbacks,
  AskStreamStatus,
  DeleteSessionResponse,
  DocumentTaskResponse,
  IndexPayload,
  IndexResponse,
  SessionListResponse,
  SessionResponse,
  UploadPayload,
} from '@/types/qa'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  payload: ApiErrorPayload

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message || `请求失败：${status}`)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : response.text()
}

async function ensureOk<T>(response: Response): Promise<T> {
  const payload = await parseResponse(response)

  if (!response.ok) {
    const errorPayload =
      typeof payload === 'object' && payload !== null ? (payload as ApiErrorPayload) : { message: String(payload) }
    throw new ApiError(response.status, errorPayload)
  }

  return payload as T
}

export function normalizeAskResponse(response: AskResponse): AskResponse {
  if (!isRecord(response)) return response

  const retrieval = getRecord(response, 'retrieval')
  if (retrieval) return response

  const retrievalTrace = getRecord(response, 'retrieval_trace')
  if (!retrievalTrace) return response

  const citations = Array.isArray(response.citations) ? response.citations : []
  const evidence = Array.isArray(response.evidence) ? response.evidence : []
  const llmTrace = getRecord(retrievalTrace, 'llm')
  const progressStages = retrievalTrace.progress_stages

  return {
    ...response,
    retrieval: {
      collection_name: stringValue(retrievalTrace.collection_name),
      trace_id: stringValue(retrievalTrace.trace_id),
      cache_hit: booleanValue(retrievalTrace.cache_hit),
      query_expansion_cache_hit: booleanValue(retrievalTrace.query_expansion_cache_hit),
      query_expansion_skipped: stringValue(retrievalTrace.query_expansion_skipped),
      llm_query_expansion_used: booleanValue(retrievalTrace.llm_query_expansion_used),
      llm_answer_cache_hit: booleanValue(llmTrace?.answer_cache_hit),
      final_response_cache_hit: booleanValue(retrievalTrace.final_response_cache_hit),
      evidence_count: evidence.length,
      citation_count: citations.length,
      repository_collection_count: numberValue(retrievalTrace.repository_collection_count),
      workflow_runner: stringValue(retrievalTrace.workflow_runner),
      workflow_duration_ms: numberValue(retrievalTrace.workflow_duration_ms),
      progress_stages: Array.isArray(progressStages) ? progressStages : [],
    },
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  return ensureOk<T>(response)
}

export function askQuestion(payload: AskPayload): Promise<AskResponse> {
  return requestJson<AskResponse>('/qa/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(normalizeAskResponse)
}

interface SseParseResult {
  final?: AskResponse
  error?: ApiError
}

function parseSseBlock(block: string, callbacks?: AskStreamCallbacks): SseParseResult {
  const lines = block.split(/\r?\n/)
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (!dataLines.length) return {}

  const data = JSON.parse(dataLines.join('\n')) as unknown
  if (event === 'status') {
    callbacks?.onStatus?.(data as AskStreamStatus)
    return {}
  }
  if (event === 'final') {
    return { final: normalizeAskResponse(data as AskResponse) }
  }
  if (event === 'error') {
    return { error: new ApiError(500, data as ApiErrorPayload) }
  }
  return {}
}

export async function askQuestionStream(payload: AskPayload, callbacks?: AskStreamCallbacks): Promise<AskResponse> {
  const response = await fetch(`${API_BASE_URL}/qa/ask/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await ensureOk<never>(response)
  }
  if (!response.body) {
    throw new Error('流式回答连接不可用')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const result = parseSseBlock(block, callbacks)
        if (result.error) throw result.error
        if (result.final) return result.final
      }

      if (done) break
    }

    if (buffer.trim()) {
      const result = parseSseBlock(buffer, callbacks)
      if (result.error) throw result.error
      if (result.final) return result.final
    }
  } finally {
    reader.releaseLock()
  }

  throw new Error('流式回答未返回最终结果')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRecord(root: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(root)) return null
  const value = root[key]
  return isRecord(value) ? value : null
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

export function indexDocument(payload: IndexPayload): Promise<IndexResponse> {
  return requestJson<IndexResponse>('/documents/index', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function uploadDocument(file: File, payload: UploadPayload): Promise<IndexResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('collection_name', payload.collection_name)
  form.append('force_rebuild', String(payload.force_rebuild))
  if (payload.doc_source?.trim()) {
    form.append('doc_source', payload.doc_source.trim())
  }

  return fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    body: form,
  }).then((response) => ensureOk<IndexResponse>(response))
}

export function startUploadDocument(file: File, payload: UploadPayload): Promise<DocumentTaskResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('collection_name', payload.collection_name)
  form.append('force_rebuild', String(payload.force_rebuild))
  if (payload.doc_source?.trim()) {
    form.append('doc_source', payload.doc_source.trim())
  }

  return fetch(`${API_BASE_URL}/documents/upload/start`, {
    method: 'POST',
    body: form,
  }).then((response) => ensureOk<DocumentTaskResponse>(response))
}

export function getDocumentTask(taskId: string): Promise<DocumentTaskResponse> {
  return requestJson<DocumentTaskResponse>(`/documents/tasks/${encodeURIComponent(taskId)}`)
}

export function getSession(sessionId: string): Promise<SessionResponse> {
  return requestJson<SessionResponse>(`/qa/sessions/${encodeURIComponent(sessionId)}`)
}

export function listSessions(collectionName: string, limit = 40, offset = 0): Promise<SessionListResponse> {
  const params = new URLSearchParams({
    collection_name: collectionName.trim() || 'default',
    limit: String(limit),
  })
  if (offset > 0) {
    params.set('offset', String(offset))
  }
  return requestJson<SessionListResponse>(`/qa/sessions?${params.toString()}`)
}

export function deleteSession(sessionId: string): Promise<DeleteSessionResponse> {
  return requestJson<DeleteSessionResponse>(`/qa/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export function checkHealth(): Promise<{ status: string }> {
  return requestJson<{ status: string }>('/health')
}

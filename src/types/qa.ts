export type Decision = 'answer' | 'clarify' | 'refuse'

export interface AskPayload {
  question: string
  session_id: string
  collection_name: string
  top_k: number
  expand_query_num: number
  enable_cache: boolean
  include_debug?: boolean
}

export interface Citation {
  citation_id: string
  chunk_id: string
  doc_id: string
  source_name?: string
  doc_source?: string
  collection_name?: string
  page_idx: number | null
  page_range: string
  heading_path: string
  quote: string
  confidence: number
}

export interface ProgressStage {
  phase: string
  status: string
  duration_ms: number
  timed?: boolean
  cache_hit?: boolean
  llm_query_expansion_used?: boolean
  evidence_count?: number
}

export interface CompactRetrieval {
  collection_name: string
  trace_id: string
  cache_hit: boolean
  evidence_count: number
  citation_count: number
  repository_collection_count: number
  workflow_runner: string
  workflow_duration_ms?: number
  progress_stages?: ProgressStage[]
}

export interface CompactAskResponse {
  answer: string
  decision: Decision
  query_type: string
  confidence: number
  session_id: string
  citations: Citation[]
  retrieval: CompactRetrieval
}

export interface DebugAskResponse extends CompactAskResponse {
  evidence?: unknown[]
  retrieval_trace?: Record<string, unknown>
  rerank_trace?: Record<string, unknown>
  skill_trace?: Record<string, unknown>
  react_observations?: unknown[]
}

export type AskResponse = CompactAskResponse | DebugAskResponse

export interface AskStreamStatus {
  message: string
  stage?: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | string
  collection_name?: string
  elapsed_ms?: number
  duration_ms?: number
  timed?: boolean
  cache_hit?: boolean
  llm_query_expansion_used?: boolean
  evidence_count?: number
}

export interface DisplayStreamStatus extends AskStreamStatus {
  stage: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  duration_ms: number
  timed?: boolean
  started_at: number
  completed_at?: number
}

export interface AskStreamCallbacks {
  onStatus?: (status: AskStreamStatus) => void
}

export interface IndexPayload {
  pdf_path: string
  doc_source?: string
  force_rebuild: boolean
  collection_name: string
}

export interface UploadPayload {
  collection_name: string
  doc_source?: string
  force_rebuild: boolean
}

export interface PipelineStep {
  key: string
  label: string
  status: 'pending' | 'running' | 'started' | 'completed' | 'skipped' | 'failed' | string
  progress: number
  detail?: string
  fields?: Record<string, unknown>
  updated_at?: string
}

export interface IndexResponse {
  success: boolean
  indexed_doc_count: number
  indexed_chunks?: number
  collection_name?: string
  trace_id?: string
  pipeline_steps?: PipelineStep[]
  documents?: Array<Record<string, unknown>>
  upload?: {
    file_name: string
    size_bytes: number
  }
  [key: string]: unknown
}

export interface DocumentTaskResponse {
  task_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  collection_name: string
  file_name?: string
  created_at?: string
  updated_at?: string
  steps: PipelineStep[]
  result?: IndexResponse | null
  error?: string
}

export interface SessionResponse {
  session_id: string
  messages: unknown[]
  retrieval_traces: unknown[]
  [key: string]: unknown
}

export interface ApiErrorPayload {
  code?: string
  message?: string
  detail?: Record<string, unknown>
  status_code?: number
}

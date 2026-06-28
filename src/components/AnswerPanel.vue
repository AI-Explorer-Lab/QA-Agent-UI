<template>
  <section class="answer-panel panel">
    <div class="panel-header">
      <div>
        <p class="eyebrow">回答</p>
        <h2>{{ panelTitle }}</h2>
      </div>
      <div v-if="response" class="answer-badges">
        <span class="status-badge" :class="response.decision">{{ response.decision }}</span>
        <span class="metric-badge">{{ response.query_type }}</span>
        <span
          v-if="retrieval"
          class="metric-badge cache-badge"
          :class="retrieval.cache_hit ? 'cache-hit' : 'cache-miss'"
        >
          cache: {{ retrieval.cache_hit ? 'true' : 'false' }}
        </span>
        <span v-if="totalElapsedMs > 0" class="metric-badge">总耗时 {{ formatElapsed(totalElapsedMs) }}</span>
        <span v-if="loading" class="metric-badge">streaming</span>
      </div>
      <div v-else-if="loading && totalElapsedMs > 0" class="answer-badges">
        <span class="metric-badge">总耗时 {{ formatElapsed(totalElapsedMs) }}</span>
      </div>
    </div>

    <div v-if="!response" class="empty-answer" :class="{ pending: loading }">
      <Sparkles :size="22" />
      <p>{{ loading ? displayLoadingMessage : '输入问题后，答案会显示在这里；引用编号可点击并联动右侧证据' }}</p>
    </div>

    <article v-else class="answer-body" data-testid="answer-body">
      <div v-if="loading && !response.answer" class="typing-placeholder">
        {{ displayLoadingMessage }}
        <span class="stream-caret" aria-hidden="true" />
      </div>
      <MarkdownRenderer v-else :content="response.answer" @focus-citation="$emit('focus-citation', $event)" />
    </article>

    <div v-if="visibleStages.length" class="progress-strip" aria-label="回答生成进度">
      <span
        v-for="stage in visibleStages"
        :key="stage.phase"
        class="progress-stage"
        :class="`stage-${stage.status}`"
        :title="stage.message"
      >
        <i />
        <strong>{{ stageLabel(stage.phase) }}</strong>
        <em v-if="stage.cache_hit">cache</em>
      </span>
    </div>

    <div v-if="retrieval" class="meta-strip">
      <span><Database :size="15" /> {{ retrieval.collection_name }}</span>
      <span><Layers3 :size="15" /> evidence {{ retrieval.evidence_count }}</span>
      <span><Quote :size="15" /> citations {{ retrieval.citation_count }}</span>
      <span><Zap :size="15" /> cache {{ retrieval.cache_hit ? 'hit' : 'miss' }}</span>
      <span class="trace-id">trace {{ retrieval.trace_id || 'pending' }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Database, Layers3, Quote, Sparkles, Zap } from '@lucide/vue'

import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import type { CompactAskResponse, CompactRetrieval, DisplayStreamStatus, ProgressStage } from '@/types/qa'

type VisibleStage = {
  phase: string
  status: string
  duration_ms: number
  timed: boolean
  cache_hit?: boolean
  message: string
}

const props = defineProps<{
  response: CompactAskResponse | null
  retrieval: CompactRetrieval | null
  loading?: boolean
  loadingMessage?: string
  streamStatuses?: DisplayStreamStatus[]
  elapsedMs?: number
}>()

defineEmits<{
  (event: 'focus-citation', citationId: string): void
}>()

const decisionTitle = computed(() => {
  if (!props.response) return ''
  if (props.response.decision === 'answer') return '已生成可核查答案'
  if (props.response.decision === 'clarify') return '需要补充信息'
  return '证据不足，已拒答'
})

const displayLoadingMessage = computed(() => normalizeDisplayMessage(props.loadingMessage))
const panelTitle = computed(() => {
  if (props.response && props.loading) return '正在流式输出答案'
  if (props.response) return decisionTitle.value
  return props.loading ? '正在生成答案' : '等待提问'
})
const totalElapsedMs = computed(() => {
  const responseElapsedMs = Number(props.retrieval?.workflow_duration_ms || 0)
  const liveElapsedMs = Number(props.elapsedMs || 0)
  return responseElapsedMs > 0 ? responseElapsedMs : liveElapsedMs
})
const visibleStages = computed(() => {
  const finalStages = props.retrieval?.progress_stages ?? []
  const sourceStages: Array<ProgressStage | DisplayStreamStatus> = finalStages.length ? finalStages : props.streamStatuses ?? []

  return sourceStages
    .map(normalizeProgressStage)
    .filter((stage) => stage.timed && stage.phase !== 'client_answer_stream')
})

function formatElapsed(value: number) {
  if (value < 1000) return String(value) + 'ms'
  return (value / 1000).toFixed(1) + 's'
}

function normalizeDisplayMessage(message?: string) {
  const text = String(message || '').trim()
  if (!text) return '正在生成答案，请稍等'
  const compact = text.replace(/\s+/g, '')
  const questionMarkCount = (compact.match(/\?/g) || []).length
  const replacementCount = (compact.match(/\uFFFD/g) || []).length
  const hasReadableText = /[\u4e00-\u9fa5A-Za-z0-9]/.test(compact)
  if ((questionMarkCount >= 3 || replacementCount >= 1) && !hasReadableText) {
    return '正在生成答案，请稍等'
  }
  return text
}

function normalizeProgressStage(stage: ProgressStage | DisplayStreamStatus): VisibleStage {
  const phase = 'phase' in stage ? stage.phase : stage.stage
  return {
    phase,
    status: stage.status || 'completed',
    duration_ms: Number(stage.duration_ms || 0),
    timed: stage.timed ?? true,
    cache_hit: stage.cache_hit,
    message: stageLabel(phase),
  }
}

function stageLabel(phase: string) {
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
    finalize_response: '整理响应',
  }
  return labels[phase] || phase
}
</script>

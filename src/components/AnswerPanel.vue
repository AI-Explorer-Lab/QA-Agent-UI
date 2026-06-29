<template>
  <section class="answer-panel panel">
    <div class="panel-header">
      <div>
        <p class="eyebrow">对话</p>
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

    <div v-if="!displayMessages.length" class="empty-answer" :class="{ pending: loading }">
      <Sparkles :size="22" />
      <p>{{ loading ? displayLoadingMessage : '输入问题后，对话会显示在这里；引用编号可点击并联动右侧证据' }}</p>
    </div>

    <div v-else class="conversation-thread" data-testid="conversation-thread">
      <article
        v-for="message in displayMessages"
        :key="message.id"
        class="chat-message"
        :class="[
          message.role,
          {
            failed: message.failed,
            active: message.id === activeMessageId,
            selectable: isSelectableAssistant(message),
          },
        ]"
        :tabindex="isSelectableAssistant(message) ? 0 : undefined"
        :aria-current="message.id === activeMessageId ? 'true' : undefined"
        @click="selectMessage(message)"
        @keydown.enter.prevent="selectMessage(message)"
        @keydown.space.prevent="selectMessage(message)"
      >
        <div class="message-avatar">{{ message.role === 'user' ? '我' : '答' }}</div>
        <div class="message-bubble">
          <div class="message-meta">
            <strong>{{ message.role === 'user' ? '你' : '可信问答助手' }}</strong>
            <span v-if="message.timestamp">{{ formatTimestamp(message.timestamp) }}</span>
          </div>
          <p v-if="message.role === 'user'" class="user-question">{{ message.content }}</p>
          <article v-else class="answer-body" data-testid="answer-body">
            <div v-if="message.loading && !message.content" class="typing-placeholder">
              {{ displayLoadingMessage }}
              <span class="stream-caret" aria-hidden="true" />
            </div>
            <MarkdownRenderer
              v-else
              :content="message.content"
              @focus-citation="focusMessageCitation(message, $event)"
            />
            <div v-if="message.response" class="message-badges">
              <span class="status-badge" :class="message.response.decision">{{ message.response.decision }}</span>
              <span class="metric-badge">{{ message.response.query_type }}</span>
              <span
                v-if="message.retrieval"
                class="metric-badge cache-badge"
                :class="message.retrieval.cache_hit ? 'cache-hit' : 'cache-miss'"
              >
                cache: {{ message.retrieval.cache_hit ? 'true' : 'false' }}
              </span>
            </div>
          </article>
        </div>
      </article>
    </div>

    <div v-if="showProgressStrip" class="progress-strip" aria-label="回答生成进度">
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

    <div v-if="retrieval && showMetaStrip" class="meta-strip">
      <span><Database :size="15" /> {{ retrieval.collection_name }}</span>
      <span><Layers3 :size="15" /> evidence {{ retrieval.evidence_count }}</span>
      <span><Quote :size="15" /> citations {{ retrieval.citation_count }}</span>
      <span><Zap :size="15" /> cache {{ retrieval.cache_hit ? 'hit' : 'miss' }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Database, Layers3, Quote, Sparkles, Zap } from '@lucide/vue'

import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import type {
  CompactAskResponse,
  CompactRetrieval,
  ConversationDisplayMessage,
  DisplayStreamStatus,
  ProgressStage,
} from '@/types/qa'

type VisibleStage = {
  phase: string
  status: string
  duration_ms: number
  timed: boolean
  cache_hit?: boolean
  message: string
}

const SUBWAY_STAGES = [
  'load_session',
  'conversation_context',
  'intent_slot_understanding_agent',
  'select_skill_from_registry',
  'clarify_gate',
  'parallel_hybrid_retrieval',
  'evidence_decision',
  'answer_generation',
]

const props = defineProps<{
  response: CompactAskResponse | null
  retrieval: CompactRetrieval | null
  messages?: ConversationDisplayMessage[]
  loading?: boolean
  loadingMessage?: string
  streamStatuses?: DisplayStreamStatus[]
  elapsedMs?: number
  activeMessageId?: string
}>()

const emit = defineEmits<{
  (event: 'focus-citation', citationId: string): void
  (event: 'select-message', messageId: string): void
  (event: 'focus-message-citation', payload: { messageId: string; citationId: string }): void
}>()

const decisionTitle = computed(() => {
  if (!props.response) return ''
  if (props.response.decision === 'answer') return '已生成可核查答案'
  if (props.response.decision === 'clarify') return '需要补充信息'
  return '证据不足，已拒答'
})

const displayLoadingMessage = computed(() => normalizeDisplayMessage(props.loadingMessage))
const displayMessages = computed<ConversationDisplayMessage[]>(() => {
  if (props.messages?.length) return props.messages
  if (!props.response) return []
  return [
    {
      id: 'current-assistant-response',
      role: 'assistant',
      content: props.response.answer,
      response: props.response,
      retrieval: props.retrieval,
      loading: props.loading,
    },
  ]
})
const panelTitle = computed(() => {
  const turnCount = displayMessages.value.filter((message) => message.role === 'user').length
  if (props.response && props.loading) return '正在流式输出答案'
  if (turnCount > 0) return `${turnCount} 轮对话`
  if (props.response) return decisionTitle.value
  return props.loading ? '正在生成答案' : '等待提问'
})
const totalElapsedMs = computed(() => {
  const responseElapsedMs = Number(props.retrieval?.workflow_duration_ms || 0)
  const liveElapsedMs = Number(props.elapsedMs || 0)
  return responseElapsedMs > 0 ? responseElapsedMs : liveElapsedMs
})
const showProgressStrip = computed(() => visibleStages.value.length > 0 && (props.loading || !props.messages?.length))
const showMetaStrip = computed(() => Boolean(props.retrieval) && (props.loading || !props.messages?.length))
const visibleStages = computed(() => {
  const finalStages = props.retrieval?.progress_stages ?? []
  const sourceStages: Array<ProgressStage | DisplayStreamStatus> = finalStages.length ? finalStages : props.streamStatuses ?? []
  if (!props.loading && !sourceStages.length) return []

  const stageMap = new Map(sourceStages.map((stage) => {
    const normalized = normalizeProgressStage(stage)
    return [normalized.phase, normalized]
  }))

  const stages = SUBWAY_STAGES.map((phase) => {
    const stage = stageMap.get(phase)
    if (stage) return stage
    return {
      phase,
      status: 'pending',
      duration_ms: 0,
      timed: false,
      cache_hit: false,
      message: stageLabel(phase),
    }
  })

  return props.loading && !props.response ? stages : trimTrailingIncompleteStages(stages)
})

function formatElapsed(value: number) {
  if (value < 1000) return String(value) + 'ms'
  return (value / 1000).toFixed(1) + 's'
}

function isSelectableAssistant(message: ConversationDisplayMessage) {
  return message.role === 'assistant' && Boolean(message.response) && !message.loading && !message.failed
}

function selectMessage(message: ConversationDisplayMessage) {
  if (!isSelectableAssistant(message)) return
  emit('select-message', message.id)
}

function focusMessageCitation(message: ConversationDisplayMessage, citationId: string) {
  if (!isSelectableAssistant(message)) {
    emit('focus-citation', citationId)
    return
  }
  emit('focus-message-citation', { messageId: message.id, citationId })
}

function formatTimestamp(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
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
    message: 'message' in stage && stage.message ? stage.message : stageLabel(phase),
  }
}

function trimTrailingIncompleteStages(stages: VisibleStage[]): VisibleStage[] {
  let end = stages.length
  while (end > 0 && ['pending', 'running'].includes(stages[end - 1].status)) {
    end -= 1
  }
  return stages.slice(0, end)
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
  }
  return labels[phase] || phase
}
</script>

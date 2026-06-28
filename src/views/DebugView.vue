<template>
  <div class="debug-view">
    <aside class="panel session-list">
      <div class="panel-header compact">
        <div>
          <p class="eyebrow">会话历史</p>
          <h2>{{ store.sessionId || '当前会话' }}</h2>
        </div>
        <button class="icon-button" type="button" title="加载会话" @click="store.loadSession">
          <RefreshCw :size="16" />
        </button>
      </div>

      <div class="session-item active">
        <span class="status-badge answer">{{ store.currentResponse?.decision || 'pending' }}</span>
        <strong>{{ store.question }}</strong>
        <small>{{ store.currentResponse?.session_id || '尚未生成 session' }}</small>
      </div>

      <div class="debug-summary">
        <span>debug response <strong>{{ store.debugResponse ? 'yes' : 'no' }}</strong></span>
        <span>session traces <strong>{{ sessionTraceCount }}</strong></span>
        <span>active source <strong>{{ activeTraceSource }}</strong></span>
      </div>

      <div class="warning-banner">
        <ShieldAlert :size="16" />
        需要完整 trace 时，请用“重新请求 Debug”并启用 include_debug
      </div>
    </aside>

    <section class="panel debug-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">开发调试</p>
          <h2>Retrieval / Rerank / Skill / Raw JSON</h2>
        </div>
        <button class="secondary-button" type="button" :disabled="store.loading" @click="store.loadDebug">
          <Braces :size="16" />
          重新请求 Debug
        </button>
      </div>

      <div class="debug-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="!hasActiveTrace" class="debug-empty">
        <Braces :size="22" />
        <p>{{ emptyTraceMessage }}</p>
      </div>
      <pre v-else class="json-tree">{{ jsonForActiveTab }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Braces, RefreshCw, ShieldAlert } from '@lucide/vue'

import { useQaStore } from '@/stores/qaStore'

type TraceValue = Record<string, unknown> | unknown[] | null

const store = useQaStore()
const tabs = [
  { key: 'retrieval', label: 'Retrieval Trace' },
  { key: 'rerank', label: 'Rerank Trace' },
  { key: 'skill', label: 'Skill Trace' },
  { key: 'raw', label: 'Raw JSON' },
]
const tabKeys = new Set(tabs.map((tab) => tab.key))
const activeTab = computed({
  get: () => tabKeys.has(store.debugActiveTab) ? store.debugActiveTab : 'retrieval',
  set: (tab: string) => {
    if (tabKeys.has(tab)) {
      store.debugActiveTab = tab
    }
  },
})

const payload = computed(() => (store.debugResponse || store.currentResponse || null) as Record<string, unknown> | null)

const sessionTraceCount = computed(() => {
  const traces = store.session?.retrieval_traces
  return Array.isArray(traces) ? traces.length : 0
})

const latestSessionTrace = computed(() => {
  const traces = store.session?.retrieval_traces
  if (!Array.isArray(traces) || traces.length === 0) return null
  const trace = traces[traces.length - 1]
  return isRecord(trace) ? trace : null
})

const activeTrace = computed<TraceValue>(() => {
  if (activeTab.value === 'raw') return payload.value || store.session || null
  if (activeTab.value === 'retrieval') {
    return firstTrace([
      getRecord(payload.value, 'retrieval_trace'),
      latestSessionTrace.value,
      getRecord(payload.value, 'retrieval'),
      findDeepRecord(store.session, 'retrieval_trace'),
    ])
  }
  if (activeTab.value === 'rerank') {
    return firstTrace([
      getRecord(payload.value, 'rerank_trace'),
      getRecord(getRecord(payload.value, 'retrieval_trace'), 'rerank_trace'),
      getRecord(latestSessionTrace.value, 'rerank_trace'),
      findDeepRecord(payload.value, 'rerank_trace'),
      findDeepRecord(store.session, 'rerank_trace'),
    ])
  }
  return firstTrace([
    getRecord(payload.value, 'skill_trace'),
    getRecord(getRecord(payload.value, 'retrieval_trace'), 'skill_trace'),
    findDeepRecord(payload.value, 'skill_trace'),
    findDeepRecord(store.session, 'skill_trace'),
  ])
})

const hasActiveTrace = computed(() => hasTraceData(activeTrace.value))

const activeTraceSource = computed(() => {
  if (activeTab.value === 'raw') return payload.value ? 'response' : store.session ? 'session' : 'none'
  if (!hasActiveTrace.value) return 'none'
  if (store.debugResponse) return 'debug'
  if (store.session) return 'session'
  return 'response'
})

const jsonForActiveTab = computed(() => JSON.stringify(activeTrace.value, null, 2))

const emptyTraceMessage = computed(() => {
  if (!payload.value && !store.session) return '暂无调试数据，请先在工作台提问，或点击“重新请求 Debug”'
  if (activeTab.value === 'rerank') return '没有找到 rerank_trace，请确认本次请求使用 include_debug=true，或先加载当前 session'
  if (activeTab.value === 'skill') return '没有找到 skill_trace，请确认后端返回了 skill_trace，或先加载当前 session'
  return '没有找到当前 tab 的 trace 数据'
})

function firstTrace(candidates: TraceValue[]): TraceValue {
  return candidates.find((candidate) => hasTraceData(candidate)) || null
}

function hasTraceData(value: TraceValue): boolean {
  if (Array.isArray(value)) return value.length > 0
  return isRecord(value) && Object.keys(value).length > 0
}

function getRecord(root: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(root)) return null
  const value = root[key]
  return isRecord(value) ? value : null
}

function findDeepRecord(root: unknown, key: string, seen = new Set<unknown>()): Record<string, unknown> | null {
  if (!root || seen.has(root)) return null
  seen.add(root)

  if (isRecord(root)) {
    const direct = root[key]
    if (isRecord(direct)) return direct
    for (const value of Object.values(root)) {
      const found = findDeepRecord(value, key, seen)
      if (found) return found
    }
  }

  if (Array.isArray(root)) {
    for (const value of root) {
      const found = findDeepRecord(value, key, seen)
      if (found) return found
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
</script>

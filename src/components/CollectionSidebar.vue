<template>
  <aside class="collection-sidebar panel">
    <div class="panel-header compact">
      <div>
        <p class="eyebrow">文档库 / Collections</p>
        <h2>{{ store.collectionName || '未命名 collection' }}</h2>
      </div>
    </div>

    <label class="field-label" for="collection">collection_name</label>
    <div class="collection-input">
      <Database :size="16" />
      <input id="collection" v-model="store.collectionName" autocomplete="off" />
    </div>

    <div class="conversation-tools">
      <button class="new-session-button" type="button" @click="store.startNewSession()">
        <MessageSquarePlus :size="16" />
        <span>新对话</span>
      </button>
      <div class="session-search">
        <Search :size="15" />
        <input v-model="store.sessionSearch" placeholder="搜索会话" autocomplete="off" />
      </div>
    </div>

    <section class="context-card" :class="{ muted: !store.sessionId }">
      <div class="context-title">
        <GitBranch :size="15" />
        <span>当前上下文</span>
      </div>
      <strong>{{ activeTopic }}</strong>
      <div class="context-chips">
        <span>{{ activeQueryType }}</span>
        <span>证据 {{ activeEvidenceCount }}</span>
      </div>
    </section>

    <section class="session-section">
      <div class="session-heading">
        <span>多轮问答</span>
        <LoaderCircle v-if="store.sessionsLoading || store.sessionLoading" :size="14" class="spin-icon" />
      </div>

      <p v-if="store.sessionsError" class="session-error">{{ store.sessionsError }}</p>

      <div v-if="store.filteredSessions.length === 0 && !store.sessionsLoading" class="empty-sessions">
        <MessagesSquare :size="20" />
        <span>当前文档库还没有会话</span>
      </div>

      <div v-else class="session-history-list">
        <article
          v-for="session in store.filteredSessions"
          :key="session.session_id"
          class="session-history-item"
          :data-session-id="session.session_id"
          :class="{ active: session.session_id === store.sessionId }"
        >
          <button type="button" class="session-item-main" @click="store.selectSession(session.session_id)">
            <span class="session-item-title">{{ session.title || '新对话' }}</span>
            <span class="session-item-meta">
              <FileText :size="13" />
              {{ session.turn_count || 0 }} 轮
              <i />
              {{ formatSessionTime(session.last_activity_at || session.updated_at) }}
            </span>
            <span class="session-item-tags">
              <em>{{ session.last_query_type || '未分类' }}</em>
              <em>证据 {{ session.evidence_count || 0 }}</em>
            </span>
          </button>
          <button
            v-if="session.session_id === store.sessionId"
            class="delete-session-button"
            type="button"
            :data-session-id="session.session_id"
            data-action="delete-session"
            :disabled="store.deletingSessionId === session.session_id"
            title="删除当前对话"
            aria-label="删除当前对话"
            @click.stop="requestDeleteCurrentSession"
          >
            <LoaderCircle v-if="store.deletingSessionId === session.session_id" :size="13" class="spin-icon" />
            <Trash2 v-else :size="14" />
          </button>
        </article>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import {
  Database,
  FileText,
  GitBranch,
  LoaderCircle,
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Trash2,
} from '@lucide/vue'

import { useQaStore } from '@/stores/qaStore'

const store = useQaStore()
let refreshTimer: number | undefined

const activeTopic = computed(() => {
  const focus = store.conversationFocus
  const topic = focus?.active_topic
  if (typeof topic === 'string' && topic.trim()) return topic
  return store.sessionId ? store.activeSessionSummary?.title || '继续当前会话' : '新对话将独立检索'
})

const activeQueryType = computed(() => store.activeQueryType)
const activeEvidenceCount = computed(() => store.activeEvidenceCount)

onMounted(() => {
  void store.refreshSessions()
})

watch(
  () => store.collectionName,
  (next, previous) => {
    if (next === previous) return
    store.startNewSession()
    if (refreshTimer) window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => {
      void store.refreshSessions()
    }, 250)
  },
)

function formatSessionTime(value?: string) {
  if (!value) return '刚刚'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '刚刚'
  const diffMs = Date.now() - timestamp
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 3_600_000) return `${Math.max(1, Math.floor(diffMs / 60_000))} 分钟前`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(timestamp)
}

async function requestDeleteCurrentSession() {
  if (!store.sessionId) return
  await store.deleteCurrentSession()
}
</script>

<template>
  <aside class="collection-sidebar panel" :class="{ collapsed }">
    <div class="panel-header compact">
      <button
        class="panel-collapse-button sidebar-collapse-button"
        type="button"
        :title="collapsed ? '展开文档库侧栏' : '隐藏文档库侧栏'"
        :aria-label="collapsed ? '展开文档库侧栏' : '隐藏文档库侧栏'"
        :aria-expanded="!collapsed"
        @click="emit('toggle-collapse')"
      >
        <ChevronRight v-if="collapsed" :size="17" />
        <ChevronLeft v-else :size="17" />
      </button>
      <div v-if="!collapsed" class="collection-title-copy">
        <p class="eyebrow">Document Library / Collections</p>
        <h2>{{ store.collectionName || '未命名 collection' }}</h2>
      </div>
    </div>

    <template v-if="!collapsed">
      <label class="field-label" for="collection">collection_name</label>
      <div class="collection-input">
        <Database :size="16" />
        <input id="collection" v-model="store.collectionName" autocomplete="off" />
      </div>

      <div class="sidebar-section-divider" aria-hidden="true"></div>

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

        <div v-else class="session-history-list" @scroll="handleSessionListScroll">
          <article
            v-for="session in store.filteredSessions"
            :key="session.session_id"
            class="session-history-item"
            :data-session-id="session.session_id"
            :class="{ active: session.session_id === store.sessionId }"
          >
            <button type="button" class="session-item-main" @click="store.selectSession(session.session_id)">
              <span class="session-item-title">{{ formatSessionTitle(session) }}</span>
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
              class="delete-session-button"
              type="button"
              :data-session-id="session.session_id"
              data-action="delete-session"
              :disabled="store.deletingSessionId === session.session_id"
              title="删除当前对话"
              aria-label="删除当前对话"
              @click.stop="requestDeleteSession(session.session_id)"
            >
              <LoaderCircle v-if="store.deletingSessionId === session.session_id" :size="13" class="spin-icon" />
              <Trash2 v-else :size="14" />
            </button>
          </article>
          <div v-if="store.sessionsLoadingMore" class="session-list-status">
            <LoaderCircle :size="13" class="spin-icon" />
            <span>继续加载会话</span>
          </div>
          <div v-else-if="!store.sessionsHasMore" class="session-list-status muted">
            <span>没有更多会话</span>
          </div>
        </div>
      </section>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  GitBranch,
  LoaderCircle,
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Trash2,
} from '@lucide/vue'

import { formatSessionTitle, useQaStore } from '@/stores/qaStore'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-collapse'): void
}>()

const store = useQaStore()
let refreshTimer: number | undefined

const activeTopic = computed(() => {
  const focus = store.conversationFocus
  const topic = focus?.active_topic
  if (typeof topic === 'string' && topic.trim()) return topic
  return store.sessionId ? formatSessionTitle(store.activeSessionSummary, '继续当前会话') : '新对话将独立检索'
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

async function requestDeleteSession(sessionId: string) {
  const sid = sessionId.trim()
  if (!sid || store.deletingSessionId) return
  await store.deleteSessionById(sid)
}

function handleSessionListScroll(event: Event) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
  if (distanceToBottom > 80) return
  void store.loadMoreSessions()
}
</script>

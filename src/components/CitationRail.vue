<template>
  <aside class="citation-rail panel" :class="{ collapsed }">
    <div class="panel-header compact">
      <div v-if="!collapsed">
        <p class="eyebrow">引用证据</p>
        <h2>{{ citations.length }} 条证据</h2>
      </div>
      <RouterLink v-if="!collapsed" class="icon-link" :to="evidenceRoute">
        <ExternalLink :size="16" />
      </RouterLink>
      <button
        class="panel-collapse-button citation-collapse-button"
        type="button"
        :title="collapsed ? '展开引用证据栏' : '隐藏引用证据栏'"
        :aria-label="collapsed ? '展开引用证据栏' : '隐藏引用证据栏'"
        :aria-expanded="!collapsed"
        @click="emit('toggle-collapse')"
      >
        <ChevronLeft v-if="collapsed" :size="17" />
        <ChevronRight v-else :size="17" />
      </button>
    </div>

    <template v-if="!collapsed">
      <div v-if="citations.length === 0" class="empty-citations">
        <FileSearch :size="22" />
        <p>答案生成后，PDF 原文证据会出现在这里</p>
      </div>

      <div v-else class="citation-list">
        <article
          v-for="citation in citations"
          :key="citation.citation_id"
          class="citation-card"
          :class="{ active: citation.citation_id === activeCitationId }"
          :data-citation-id="citation.citation_id"
        >
          <button type="button" class="citation-card-main" @click="emit('select', citation.citation_id)">
            <span class="citation-id">{{ citation.citation_id }}</span>
            <span class="citation-title">{{ citation.heading_path || '未命名标题路径' }}</span>
          </button>
          <div class="citation-meta">
            <span><FileText :size="14" /> {{ citation.source_name || citation.doc_source || 'PDF' }}</span>
            <span><MapPinned :size="14" /> page {{ formatCitationPage(citation) }}</span>
            <span><Fingerprint :size="14" /> {{ formatCitationChunk(citation.chunk_id) }}</span>
          </div>
          <p class="quote-box">{{ citation.quote }}</p>
        </article>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, ExternalLink, FileSearch, FileText, Fingerprint, MapPinned } from '@lucide/vue'

import type { Citation } from '@/types/qa'
import { formatCitationChunk, formatCitationPage } from '@/utils/citationPage'

const props = defineProps<{
  citations: Citation[]
  activeCitationId: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  (event: 'select', citationId: string): void
  (event: 'toggle-collapse'): void
}>()

const evidenceRoute = computed(() =>
  props.activeCitationId
    ? { name: 'evidence', params: { citationId: props.activeCitationId } }
    : { name: 'evidence' },
)
</script>

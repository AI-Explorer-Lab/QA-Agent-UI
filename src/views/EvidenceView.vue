<template>
  <div class="evidence-view">
    <section class="panel evidence-answer">
      <div class="panel-header">
        <div>
          <p class="eyebrow">回答 > 引用核查</p>
          <h2>{{ pageTitle }}</h2>
        </div>
        <RouterLink class="secondary-button" to="/">
          <ArrowLeft :size="16" />
          返回工作台
        </RouterLink>
      </div>

      <div v-if="!store.currentResponse" class="empty-answer large">
        <FileSearch :size="26" />
        <p>请先在问答工作台完成一次提问，随后可在这里核查全部引用证据</p>
      </div>

      <article v-else class="answer-body evidence-body">
        <MarkdownRenderer :content="store.currentResponse.answer" @focus-citation="selectCitation" />
      </article>

      <div v-if="store.citations.length" class="citation-overview">
        <div class="section-title">
          <Quote :size="16" />
          全部引用
        </div>
        <div class="evidence-citation-list">
          <button
            v-for="citation in store.citations"
            :key="citation.citation_id"
            type="button"
            class="evidence-citation-chip"
            :class="{ active: citation.citation_id === selectedCitation?.citation_id }"
            @click="selectCitation(citation.citation_id)"
          >
            <span class="citation-id">{{ citation.citation_id }}</span>
            <strong>{{ citation.heading_path || citation.source_name || 'PDF evidence' }}</strong>
            <small>{{ citation.source_name || citation.doc_source || 'PDF' }} · page {{ formatCitationPage(citation) }}</small>
          </button>
        </div>
      </div>
    </section>

    <section class="panel evidence-detail">
      <div class="panel-header">
        <div>
          <p class="eyebrow">证据详情</p>
          <h2>{{ selectedCitation?.source_name || 'PDF 原文' }}</h2>
        </div>
        <div class="detail-actions">
          <button class="icon-button" type="button" title="复制 quote" @click="copyQuote">
            <Copy :size="16" />
          </button>
          <button class="icon-button" type="button" title="定位 PDF 页">
            <BookOpen :size="16" />
          </button>
          <button class="icon-button" type="button" title="固定证据">
            <Pin :size="16" />
          </button>
        </div>
      </div>

      <template v-if="selectedCitation">
        <div class="evidence-facts">
          <span><FileText :size="15" /> {{ selectedCitation.source_name || selectedCitation.doc_source }}</span>
          <span><MapPinned :size="15" /> page {{ formatCitationPage(selectedCitation) }}</span>
          <span><Fingerprint :size="15" /> {{ selectedCitation.chunk_id }}</span>
        </div>
        <div class="full-quote rendered-quote">
          <MarkdownRenderer :content="selectedCitation.quote" @focus-citation="selectCitation" />
        </div>
      </template>

      <div v-else class="empty-citations">
        <Quote :size="24" />
        <p>点击回答里的引用编号打开指定引用</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, Copy, FileSearch, FileText, Fingerprint, MapPinned, Pin, Quote } from '@lucide/vue'

import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useQaStore } from '@/stores/qaStore'
import { formatCitationPage } from '@/utils/citationPage'

const route = useRoute()
const router = useRouter()
const store = useQaStore()

const selectedCitation = computed(() => {
  const routeCitationId = String(route.params.citationId || '')
  const citationId = routeCitationId || store.selectedCitationId
  return store.citations.find((item) => item.citation_id === citationId) || store.citations[0] || null
})

const pageTitle = computed(() => (selectedCitation.value ? '引用 ' + selectedCitation.value.citation_id : '选择一个引用'))

function selectCitation(citationId: string) {
  if (!citationId) return
  store.setSelectedCitation(citationId)
  router.push({ name: 'evidence', params: { citationId } })
}

watch(
  () => route.params.citationId,
  (value) => {
    const citationId = String(value || '')
    if (citationId && store.citations.some((item) => item.citation_id === citationId)) {
      store.setSelectedCitation(citationId)
    }
  },
  { immediate: true },
)

async function copyQuote() {
  if (!selectedCitation.value) return
  await navigator.clipboard?.writeText(selectedCitation.value.quote)
}
</script>

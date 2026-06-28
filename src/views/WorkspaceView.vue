<template>
  <div class="workspace-grid">
    <CollectionSidebar />

    <section class="work-column">
      <QuestionComposer />
      <div v-if="store.error" class="error-banner">
        <TriangleAlert :size="18" />
        <span>{{ store.error }}</span>
      </div>
      <AnswerPanel
        :response="store.currentResponse"
        :retrieval="store.retrieval"
        :loading="store.loading"
        :loading-message="store.loadingMessage"
        :stream-statuses="store.streamStatuses"
        :elapsed-ms="store.displayElapsedMs"
        @focus-citation="focusCitation"
      />
    </section>

    <CitationRail :citations="store.citations" :active-citation-id="activeCitationId" @select="focusCitation" />
  </div>
</template>

<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import AnswerPanel from '@/components/AnswerPanel.vue'
import CitationRail from '@/components/CitationRail.vue'
import CollectionSidebar from '@/components/CollectionSidebar.vue'
import QuestionComposer from '@/components/QuestionComposer.vue'
import { useCitationNavigation } from '@/composables/useCitationNavigation'
import { useQaStore } from '@/stores/qaStore'

const store = useQaStore()
const { activeCitationId, focusCitation } = useCitationNavigation()
</script>

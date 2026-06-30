<template>
  <div
    class="workspace-grid"
    :class="{ 'sidebar-collapsed': isSidebarCollapsed, 'citation-collapsed': isCitationRailCollapsed }"
  >
    <CollectionSidebar :collapsed="isSidebarCollapsed" @toggle-collapse="isSidebarCollapsed = !isSidebarCollapsed" />

    <section class="work-column">
      <div v-if="store.error" class="error-banner">
        <TriangleAlert :size="18" />
        <span>{{ store.error }}</span>
      </div>
      <AnswerPanel
        :response="store.currentResponse"
        :retrieval="store.retrieval"
        :messages="store.conversationMessages"
        :loading="store.loading"
        :loading-message="store.loadingMessage"
        :stream-statuses="store.streamStatuses"
        :elapsed-ms="store.displayElapsedMs"
        :active-message-id="store.activeAssistantMessageId"
        @focus-citation="focusCitation"
        @select-message="selectConversationMessage"
        @focus-message-citation="focusMessageCitation"
      />
      <QuestionComposer />
    </section>

    <CitationRail
      :citations="store.citations"
      :active-citation-id="activeCitationId"
      :collapsed="isCitationRailCollapsed"
      @select="focusCitation"
      @toggle-collapse="isCitationRailCollapsed = !isCitationRailCollapsed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { TriangleAlert } from '@lucide/vue'

import AnswerPanel from '@/components/AnswerPanel.vue'
import CitationRail from '@/components/CitationRail.vue'
import CollectionSidebar from '@/components/CollectionSidebar.vue'
import QuestionComposer from '@/components/QuestionComposer.vue'
import { useCitationNavigation } from '@/composables/useCitationNavigation'
import { useQaStore } from '@/stores/qaStore'

const store = useQaStore()
const isSidebarCollapsed = ref(false)
const isCitationRailCollapsed = ref(false)
const { activeCitationId, focusCitation } = useCitationNavigation()

function selectConversationMessage(messageId: string) {
  store.activateConversationMessage(messageId)
}

async function focusMessageCitation(payload: { messageId: string; citationId: string }) {
  store.activateConversationMessage(payload.messageId, payload.citationId)
  await focusCitation(payload.citationId)
}
</script>

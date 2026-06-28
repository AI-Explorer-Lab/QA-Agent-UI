import { computed, nextTick } from 'vue'

import { useQaStore } from '@/stores/qaStore'

export function useCitationNavigation() {
  const store = useQaStore()
  const activeCitationId = computed(() => store.selectedCitationId)

  async function focusCitation(citationId: string) {
    store.setSelectedCitation(citationId)
    await nextTick()
    document.querySelector(`[data-citation-id="${citationId}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  return {
    activeCitationId,
    focusCitation,
  }
}

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">TA</span>
        <span>
          <strong>Trusted Agent UI</strong>
          <small>可信问答工作台</small>
        </span>
      </RouterLink>

      <nav class="nav-tabs" aria-label="主导航">
        <RouterLink to="/upload">
          <UploadCloud :size="17" />
          上传文档
        </RouterLink>
        <RouterLink to="/">
          <MessagesSquare :size="17" />
          问答工作台
        </RouterLink>
        <RouterLink :to="evidenceRoute">
          <FileSearch :size="17" />
          证据核查
        </RouterLink>
        <RouterLink to="/debug">
          <Braces :size="17" />
          调试与会话
        </RouterLink>
      </nav>

      <div class="service-chip">
        <span class="pulse-dot" />
        Backend · 8000
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Braces, FileSearch, MessagesSquare, UploadCloud } from '@lucide/vue'

import { useQaStore } from '@/stores/qaStore'

const store = useQaStore()
const evidenceRoute = computed(() =>
  store.selectedCitationId
    ? { name: 'evidence', params: { citationId: store.selectedCitationId } }
    : { name: 'evidence' },
)
</script>

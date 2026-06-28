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
  </aside>
</template>

<script setup lang="ts">
import { Database } from '@lucide/vue'

import { useQaStore } from '@/stores/qaStore'

const store = useQaStore()
</script>

<template>
  <section class="question-composer panel">
    <div class="composer-topline">
      <span class="field-title">问题框</span>
    </div>

    <textarea
      v-model="store.question"
      aria-label="问题"
      placeholder="请输入你想基于 PDF 证据核查的问题，例如：总结某家公司简介与历史沿革"
    />

    <div class="control-grid">
      <label>
        <span>top_k</span>
        <input v-model.number="store.topK" type="number" min="1" max="20" />
      </label>
      <label>
        <span>expand_query_num</span>
        <input v-model.number="store.expandQueryNum" type="number" min="1" max="8" />
      </label>
      <button class="toggle" :class="{ on: store.enableCache }" type="button" @click="store.enableCache = !store.enableCache">
        <ToggleLeft v-if="!store.enableCache" :size="17" />
        <ToggleRight v-else :size="17" />
        enable_cache
      </button>
      <button class="toggle" :class="{ on: store.includeDebug }" type="button" @click="store.includeDebug = !store.includeDebug">
        <Braces :size="17" />
        include_debug
      </button>
    </div>

    <div class="composer-actions">
      <button class="primary-button" type="button" :disabled="store.loading || !store.question.trim()" @click="store.ask()">
        <SendHorizonal :size="17" />
        {{ store.loading ? '生成中' : '提问' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Braces, SendHorizonal, ToggleLeft, ToggleRight } from '@lucide/vue'

import { useQaStore } from '@/stores/qaStore'

const store = useQaStore()
</script>

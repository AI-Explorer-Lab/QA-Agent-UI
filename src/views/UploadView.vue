<template>
  <div class="upload-view">
    <section class="upload-panel panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Document Upload</p>
          <h2>上传文档</h2>
        </div>
      </div>

      <div class="upload-form">
        <label class="field-block">
          <span>collection_name</span>
          <div class="collection-input inline">
            <Database :size="16" />
            <input v-model="store.uploadCollectionName" autocomplete="off" />
          </div>
        </label>

        <label class="field-block">
          <span>doc_source</span>
          <input v-model="docSource" class="text-input" placeholder="留空时使用文件名" />
        </label>

        <label class="file-drop" :class="{ ready: selectedFile }">
          <input accept="application/pdf,.pdf" type="file" @change="onFileChange" />
          <UploadCloud :size="28" />
          <strong>{{ selectedFile ? selectedFile.name : '选择 PDF 文件' }}</strong>
          <small v-if="selectedFile">{{ formatBytes(selectedFile.size) }}</small>
        </label>

        <label class="checkbox-line">
          <input v-model="forceRebuild" type="checkbox" />
          force_rebuild
        </label>

        <button class="primary-button upload-submit" type="button" :disabled="store.indexing || !selectedFile" @click="submitUpload">
          <LoaderCircle v-if="store.indexing" :size="17" class="spin-icon" />
          <UploadCloud v-else :size="17" />
          {{ store.indexing ? '入库中' : '开始入库' }}
        </button>
      </div>

      <div v-if="store.error" class="error-banner upload-error">
        <AlertCircle :size="18" />
        <span>{{ store.error }}</span>
      </div>
    </section>

    <section class="pipeline-panel panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Pipeline</p>
          <h2>{{ progressTitle }}</h2>
        </div>
        <span class="metric-badge">{{ totalProgress }}%</span>
      </div>

      <div class="progress-bar" aria-label="入库进度">
        <i :style="{ width: `${totalProgress}%` }" />
      </div>

      <ol class="pipeline-list">
        <li v-for="step in displaySteps" :key="step.key" :class="`step-${step.status}`">
          <span class="step-icon">
            <CheckCircle2 v-if="isDone(step.status)" :size="17" />
            <CircleDashed v-else-if="step.status === 'skipped'" :size="17" />
            <LoaderCircle v-else-if="isRunning(step.status)" :size="17" class="spin-icon" />
            <Circle v-else :size="17" />
          </span>
          <div>
            <strong>{{ step.label }}</strong>
            <small>{{ step.detail || statusText(step.status) }}</small>
          </div>
          <em>{{ Math.round(step.progress || 0) }}%</em>
        </li>
      </ol>
    </section>

    <section class="result-panel panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Result</p>
          <h2>入库结果</h2>
        </div>
      </div>

      <div v-if="store.indexingResult" class="result-grid">
        <span>
          <small>collection</small>
          <strong>{{ store.indexingResult.collection_name || store.uploadCollectionName }}</strong>
        </span>
        <span>
          <small>documents</small>
          <strong>{{ store.indexingResult.indexed_doc_count }}</strong>
        </span>
        <span>
          <small>chunks</small>
          <strong>{{ store.indexingResult.indexed_chunks ?? 0 }}</strong>
        </span>
        <span>
          <small>trace_id</small>
          <strong>{{ store.indexingResult.trace_id || '-' }}</strong>
        </span>
      </div>

      <div v-if="store.indexingResult?.documents?.length" class="indexed-documents">
        <article v-for="doc in store.indexingResult.documents" :key="String(doc.doc_id || doc.doc_source)" class="indexed-doc">
          <FileText :size="18" />
          <div>
            <strong>{{ doc.title || doc.doc_source }}</strong>
            <small>{{ doc.chunk_count ?? 0 }} chunks · {{ doc.parser_source || 'parser' }}</small>
          </div>
        </article>
      </div>

      <div v-if="!store.indexing && !store.indexingResult" class="debug-empty">
        <FileText :size="32" />
        <p>等待上传</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleDashed,
  Database,
  FileText,
  LoaderCircle,
  UploadCloud,
} from '@lucide/vue'

import { useQaStore } from '@/stores/qaStore'
import type { PipelineStep } from '@/types/qa'

const store = useQaStore()
const selectedFile = ref<File | null>(null)
const forceRebuild = ref(false)
const docSource = ref('')

const baseSteps: PipelineStep[] = [
  { key: 'upload', label: '上传文件', status: 'pending', progress: 0 },
  { key: 'collect', label: '收集文档', status: 'pending', progress: 0 },
  { key: 'ocr', label: 'OCR / PDF 解析', status: 'pending', progress: 0 },
  { key: 'chunking', label: 'chunking', status: 'pending', progress: 0 },
  { key: 'embedding', label: 'embedding', status: 'pending', progress: 0 },
  { key: 'database', label: '入库', status: 'pending', progress: 0 },
]

const displaySteps = computed<PipelineStep[]>(() => {
  if (store.indexingTask?.steps?.length) {
    return localizeSteps(store.indexingTask.steps)
  }
  if (store.indexingResult?.pipeline_steps?.length) {
    return localizeSteps(store.indexingResult.pipeline_steps)
  }
  return baseSteps
})

const totalProgress = computed(() => {
  const steps = displaySteps.value
  if (!steps.length) return 0
  return Math.round(steps.reduce((sum, step) => sum + Number(step.progress || 0), 0) / steps.length)
})

const progressTitle = computed(() => {
  if (store.indexing) return '入库进行中'
  if (store.indexingResult?.success) return '入库完成'
  return '等待开始'
})

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

function submitUpload() {
  if (!selectedFile.value) return
  void store.uploadPdf(selectedFile.value, {
    collection_name: store.uploadCollectionName.trim() || 'default',
    doc_source: docSource.value,
    force_rebuild: forceRebuild.value,
  })
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function statusText(status: string): string {
  if (isDone(status)) return '已完成'
  if (isRunning(status)) return '后端处理中'
  if (status === 'skipped') return '已跳过'
  if (status === 'failed') return '失败'
  return '待处理'
}

function isDone(status: string): boolean {
  return status === 'done' || status === 'completed'
}

function isRunning(status: string): boolean {
  return status === 'active' || status === 'started' || status === 'running'
}

function localizeSteps(steps: PipelineStep[]): PipelineStep[] {
  return steps.map((step) => ({
    ...step,
    label: stepLabel(step.key, step.label),
    detail: step.detail || statusText(step.status),
  }))
}

function stepLabel(key: string, fallback: string): string {
  const labels: Record<string, string> = {
    upload: '上传文件',
    collect: '收集文档',
    dedupe: '重复检测',
    ocr: 'OCR / PDF 解析',
    chunking: 'chunking',
    embedding: 'embedding',
    database: '入库',
  }
  return labels[key] || fallback
}
</script>

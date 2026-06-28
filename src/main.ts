import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import DebugView from './views/DebugView.vue'
import EvidenceView from './views/EvidenceView.vue'
import UploadView from './views/UploadView.vue'
import WorkspaceView from './views/WorkspaceView.vue'
import './styles/main.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'workspace', component: WorkspaceView },
    { path: '/upload', name: 'upload', component: UploadView },
    { path: '/evidence/:citationId?', name: 'evidence', component: EvidenceView },
    { path: '/debug', name: 'debug', component: DebugView },
  ],
})

createApp(App).use(createPinia()).use(router).mount('#app')

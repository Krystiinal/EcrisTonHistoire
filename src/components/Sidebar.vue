<script setup>
import { ref, inject } from 'vue'

const props = defineProps({
  projects: Array,
  currentProjectId: Number,
  currentView: String,
})
const emit = defineEmits(['change-view', 'select-project', 'new-project', 'go-home'])

const openSettings = inject('openSettings')
const globalSave   = inject('globalSave')
const globalSaving = inject('globalSaving')
const showNewProjectModal = ref(false)
const newProjectName = ref('')

const navItems = [
  {
    view: 'projet',
    label: 'Projet',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  },
  {
    view: 'ecriture',
    label: 'Écriture',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  },
  {
    view: 'liminaires',
    label: 'Liminaires',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  },
  {
    view: 'characters',
    label: 'Personnages',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  },
  {
    view: 'relationships',
    label: 'Relations',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  },
  {
    view: 'timeline',
    label: 'Chronologie',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  },
  {
    view: 'stats',
    label: 'Statistiques',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  },
]

function openNewProject() {
  newProjectName.value = ''
  showNewProjectModal.value = true
}
function confirmNewProject() {
  const name = newProjectName.value.trim()
  if (!name) return
  showNewProjectModal.value = false
  emit('new-project', name)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <button class="home-btn" @click="emit('go-home')" title="Retour à l'accueil">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Accueil
      </button>
      <select
        :value="currentProjectId"
        @change="e => emit('select-project', parseInt(e.target.value))"
        title="Projet actif"
      >
        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.view"
        class="nav-btn"
        :class="{ active: currentView === item.view }"
        @click="emit('change-view', item.view)"
      >
        <span class="nav-icon" v-html="item.icon"></span>
        {{ item.label }}
      </button>
    </nav>

    <div class="sidebar-footer">
      <button
        class="global-save-btn"
        :class="{ saving: globalSaving }"
        :disabled="globalSaving"
        :title="globalSaving ? 'Sauvegarde en cours…' : 'Sauvegarder le projet (Ctrl+S)'"
        @click="globalSave"
      >
        <span v-if="globalSaving" class="gsb-spin"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
        <span v-else><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span>
        {{ globalSaving ? 'Sauvegarde…' : 'Sauvegarder' }}
      </button>
      <button class="settings-btn" @click="openSettings" title="Paramètres">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Paramètres
      </button>
    </div>
  </aside>

  <!-- Modal nouveau projet -->
  <div v-if="showNewProjectModal" class="modal-overlay">
    <div class="modal">
      <h2>Nouveau projet</h2>
      <label>Nom du projet
        <input
          v-model="newProjectName"
          type="text"
          placeholder="Ex: Le Silence des Cendres"
          @keydown.enter="confirmNewProject"
          @keydown.escape="showNewProjectModal = false"
          ref="input"
        >
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" @click="showNewProjectModal = false">Annuler</button>
        <button class="btn-primary" @click="confirmNewProject">Créer</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue'

const props = defineProps({
  projects: Array,
  currentProjectId: Number,
  currentView: String,
})
const emit = defineEmits(['change-view', 'select-project', 'new-project'])

const openSettings = inject('openSettings')
const globalSave   = inject('globalSave')
const globalSaving = inject('globalSaving')
const showNewProjectModal = ref(false)
const newProjectName = ref('')

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
      <h1>Ecris Ton Histoire</h1>
      <select
        :value="currentProjectId"
        @change="e => emit('select-project', parseInt(e.target.value))"
        title="Projet actif"
      >
        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        <option v-if="!projects.length" value="">Aucun projet</option>
      </select>
      <button @click="openNewProject">+ Projet</button>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="item in [
          { view: 'projet', label: '📁 Projet' },
          { view: 'ecriture', label: '✍️ Écriture' },
          { view: 'liminaires', label: '📑 Liminaires' },
          { view: 'characters', label: '👤 Personnages' },
          { view: 'relationships', label: '🔗 Relations' },
          { view: 'timeline', label: '📅 Chronologie' },
        ]"
        :key="item.view"
        class="nav-btn"
        :class="{ active: currentView === item.view }"
        @click="emit('change-view', item.view)"
      >
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
        <span v-if="globalSaving" class="gsb-spin">⟳</span>
        <span v-else>💾</span>
        {{ globalSaving ? 'Sauvegarde…' : 'Sauvegarder' }}
      </button>
      <button class="settings-btn" @click="openSettings" title="Paramètres">
        ⚙ Paramètres
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

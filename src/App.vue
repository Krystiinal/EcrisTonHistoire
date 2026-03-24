<script setup>
import { ref, provide, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ProjetView from './views/ProjetView.vue'
import PersonnagesView from './views/PersonnagesView.vue'
import RelationsView from './views/RelationsView.vue'
import TimelineView from './views/TimelineView.vue'
import EcritureView from './views/EcritureView.vue'
import LiminairesView from './views/LiminairesView.vue'

const currentView = ref('projet')
const projects = ref([])
const currentProjectId = ref(null)
const characters = ref([])

// ---- Mise à jour ----
const updateAvailable = ref(null) // { version, url }
window.api.app.onUpdateAvailable((version, url) => { updateAvailable.value = { version, url } })

// ---- Thème ----
const theme = ref(localStorage.getItem('theme') || 'dark')

function applyTheme(t) {
  document.documentElement.classList.toggle('theme-light', t === 'light')
  localStorage.setItem('theme', t)
  theme.value = t
}

onMounted(() => applyTheme(theme.value))

// ---- Paramètres ----
const showSettings = ref(false)

provide('openSettings', () => { showSettings.value = true; loadBackups(); loadAutoBackupSettings() })

// ---- Statut de sauvegarde global ----
const chapterSave = ref({ status: '', time: null }) // '', 'saving', 'saved'
provide('setSaveStatus', (status, time) => { chapterSave.value = { status, time } })

function formatTime(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---- Save-before-quit + sauvegarde globale ----
let _forceSave = null
provide('registerForceSave', (fn) => { _forceSave = fn })

const globalSaving = ref(false)
provide('globalSave', async () => {
  if (globalSaving.value) return
  globalSaving.value = true
  if (_forceSave) await _forceSave()
  setTimeout(() => { globalSaving.value = false }, 1500)
})
provide('globalSaving', globalSaving)

window.api.app.onRequestSave(async () => {
  if (_forceSave) await _forceSave()
  await window.api.app.saveComplete()
})

// ---- Backups ----
const backups = ref([])
const backupWorking = ref(false)
const backupMsg = ref('')

async function loadBackups() {
  backups.value = await window.api.backup.list()
}

async function createBackup() {
  backupWorking.value = true
  backupMsg.value = ''
  try {
    const b = await window.api.backup.create()
    backups.value.unshift(b)
    backupMsg.value = 'Sauvegarde créée ✓'
    setTimeout(() => { backupMsg.value = '' }, 3000)
  } finally {
    backupWorking.value = false
  }
}

async function restoreBackup(name) {
  const ok = await confirm(`Restaurer "${name}" ? L'état actuel sera sauvegardé automatiquement avant la restauration. L'application doit être redémarrée ensuite.`)
  if (!ok) return
  backupWorking.value = true
  try {
    await window.api.backup.restore(name)
    backupMsg.value = 'Restauration effectuée — redémarre l\'application.'
  } finally {
    backupWorking.value = false
  }
}

async function deleteBackup(name) {
  const ok = await confirm(`Supprimer la sauvegarde "${name}" ?`)
  if (!ok) return
  await window.api.backup.delete(name)
  backups.value = backups.value.filter(b => b.name !== name)
}

function formatBackupDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' Ko' : (bytes / 1024 / 1024).toFixed(1) + ' Mo'
}

// ---- Auto-backup ----
const autoBackup = ref({ enabled: false, interval: 60, lastBackup: null })

async function loadAutoBackupSettings() {
  autoBackup.value = await window.api.autobackup.getSettings()
}

async function saveAutoBackupSettings() {
  await window.api.autobackup.set({
    enabled:  autoBackup.value.enabled,
    interval: autoBackup.value.interval,
  })
}

window.api.autobackup.onDone((date) => {
  autoBackup.value.lastBackup = date
})

onMounted(loadAutoBackupSettings)

// ---- Modal confirm global ----
const confirmState = ref({ show: false, message: '', resolve: null })

function confirm(message) {
  return new Promise(resolve => {
    confirmState.value = { show: true, message, resolve }
  })
}
function onConfirmOk() {
  confirmState.value.resolve(true)
  confirmState.value.show = false
}
function onConfirmCancel() {
  confirmState.value.resolve(false)
  confirmState.value.show = false
}

provide('confirm', confirm)

async function loadProjects() {
  const list = await window.api.projects.getAll()
  projects.value = list
  if (list.length > 0) {
    const saved = localStorage.getItem('lastProjectId')
    const match = list.find(p => p.id == saved)
    currentProjectId.value = match ? match.id : list[0].id
    await loadCharacters()
  }
}

async function loadCharacters() {
  if (!currentProjectId.value) { characters.value = []; return }
  characters.value = await window.api.characters.getAll(currentProjectId.value)
}

async function onSelectProject(id) {
  currentProjectId.value = id
  localStorage.setItem('lastProjectId', id)
  await loadCharacters()
}

async function onNewProject(name) {
  const project = await window.api.projects.create(name)
  await loadProjects()
  currentProjectId.value = project.id
  localStorage.setItem('lastProjectId', project.id)
  await loadCharacters()
  currentView.value = 'projet'
}

async function onProjectDeleted() {
  currentProjectId.value = null
  characters.value = []
  await loadProjects()
}

async function onProjectUpdated(name) {
  const idx = projects.value.findIndex(p => p.id === currentProjectId.value)
  if (idx !== -1) projects.value[idx].name = name
}

onMounted(loadProjects)
</script>

<template>
  <!-- Bannière mise à jour -->
  <div v-if="updateAvailable" class="update-banner">
    <span>🎉 Une nouvelle version est disponible : <strong>v{{ updateAvailable.version }}</strong></span>
    <a :href="updateAvailable.url" target="_blank" class="update-banner-link">Télécharger</a>
    <button class="update-banner-close" @click="updateAvailable = null">×</button>
  </div>

  <div class="app-body">
  <Sidebar
    :projects="projects"
    :current-project-id="currentProjectId"
    :current-view="currentView"
    @change-view="v => currentView = v"
    @select-project="onSelectProject"
    @new-project="onNewProject"
  />

  <main class="main-content">
    <ProjetView
      v-if="currentView === 'projet'"
      :project-id="currentProjectId"
      @updated="onProjectUpdated"
      @deleted="onProjectDeleted"
    />
    <PersonnagesView
      v-else-if="currentView === 'characters'"
      :project-id="currentProjectId"
      :characters="characters"
      @characters-changed="loadCharacters"
    />
    <RelationsView
      v-else-if="currentView === 'relationships'"
      :project-id="currentProjectId"
      :characters="characters"
    />
    <EcritureView
      v-else-if="currentView === 'ecriture'"
      :project-id="currentProjectId"
    />
    <LiminairesView
      v-else-if="currentView === 'liminaires'"
      :project-id="currentProjectId"
    />
    <TimelineView
      v-else-if="currentView === 'timeline'"
      :project-id="currentProjectId"
    />
  </main>
  </div><!-- fin .app-body -->

  <!-- Barre de statut globale -->
  <div class="app-status-bar">
    <div class="status-left">
      <template v-if="chapterSave.status === 'saving'">
        <span class="status-dot dot-saving"></span>
        <span class="status-text">Sauvegarde en cours…</span>
      </template>
      <template v-else-if="chapterSave.status === 'saved'">
        <span class="status-dot dot-saved"></span>
        <span class="status-text">Chapitre sauvegardé à {{ formatTime(chapterSave.time) }}</span>
      </template>
      <template v-else>
        <span class="status-dot dot-idle"></span>
        <span class="status-text status-idle">Aucune modification en attente</span>
      </template>
    </div>
    <div class="status-right">
      <template v-if="autoBackup.enabled">
        <span class="status-backup-icon">🔄</span>
        <span class="status-text" v-if="autoBackup.lastBackup">
          Backup auto : {{ formatTime(autoBackup.lastBackup) }}
        </span>
        <span class="status-text status-idle" v-else>Backup auto activé</span>
      </template>
    </div>
  </div>

  <!-- Modal confirmation globale -->
  <div v-if="confirmState.show" class="modal-overlay">
    <div class="modal modal-sm">
      <p>{{ confirmState.message }}</p>
      <div class="modal-actions">
        <button class="btn-secondary" @click="onConfirmCancel">Annuler</button>
        <button class="btn-danger" @click="onConfirmOk">Supprimer</button>
      </div>
    </div>
  </div>

  <!-- Modal Paramètres -->
  <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
    <div class="modal settings-modal">
      <h2>Paramètres</h2>

      <section class="settings-section">
        <h3>Apparence</h3>
        <div class="theme-picker">
          <button
            class="theme-card"
            :class="{ active: theme === 'dark' }"
            @click="applyTheme('dark')"
          >
            <div class="theme-preview theme-preview-dark">
              <div class="tp-sidebar"></div>
              <div class="tp-content">
                <div class="tp-line"></div>
                <div class="tp-line tp-line-short"></div>
              </div>
            </div>
            <span>Sombre</span>
          </button>

          <button
            class="theme-card"
            :class="{ active: theme === 'light' }"
            @click="applyTheme('light')"
          >
            <div class="theme-preview theme-preview-light">
              <div class="tp-sidebar"></div>
              <div class="tp-content">
                <div class="tp-line"></div>
                <div class="tp-line tp-line-short"></div>
              </div>
            </div>
            <span>Clair</span>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <h3>Sauvegarde automatique</h3>
        <div class="autobackup-row">
          <label class="autobackup-toggle">
            <input type="checkbox" v-model="autoBackup.enabled" @change="saveAutoBackupSettings">
            <span>Activer la sauvegarde automatique</span>
          </label>
        </div>
        <div class="autobackup-interval" v-if="autoBackup.enabled">
          <span class="autobackup-label">Toutes les</span>
          <select v-model.number="autoBackup.interval" @change="saveAutoBackupSettings">
            <option :value="15">15 minutes</option>
            <option :value="30">30 minutes</option>
            <option :value="60">1 heure</option>
            <option :value="120">2 heures</option>
            <option :value="240">4 heures</option>
          </select>
          <span class="autobackup-note">(5 dernières conservées)</span>
        </div>
        <p class="autobackup-last" v-if="autoBackup.lastBackup">
          Dernière sauvegarde auto : {{ formatBackupDate(autoBackup.lastBackup) }}
        </p>
      </section>

      <section class="settings-section">
        <h3>Sauvegardes manuelles</h3>
        <p class="backup-info">La base de données est sauvegardée dans <code>%APPDATA%\WriteForge\backups\</code></p>

        <div class="backup-actions-row">
          <button class="btn-primary backup-create-btn" :disabled="backupWorking" @click="createBackup">
            {{ backupWorking ? '…' : '+ Créer une sauvegarde' }}
          </button>
          <button class="backup-folder-btn" title="Ouvrir le dossier des sauvegardes" @click="window.api.backup.openFolder()">📁 Ouvrir le dossier</button>
        </div>

        <p v-if="backupMsg" class="backup-msg">{{ backupMsg }}</p>

        <div class="backup-list" v-if="backups.length">
          <div v-for="b in backups" :key="b.name" class="backup-item">
            <div class="backup-item-info">
              <span class="backup-item-date">{{ formatBackupDate(b.date) }}</span>
              <span class="backup-item-size">{{ formatSize(b.size) }}</span>
            </div>
            <div class="backup-item-actions">
              <button class="backup-btn-restore" :disabled="backupWorking" @click="restoreBackup(b.name)">Restaurer</button>
              <button class="backup-btn-delete" :disabled="backupWorking" @click="deleteBackup(b.name)">✕</button>
            </div>
          </div>
        </div>
        <p v-else class="backup-empty">Aucune sauvegarde.</p>
      </section>

      <div class="modal-actions">
        <button class="btn-primary" @click="showSettings = false">Fermer</button>
      </div>
    </div>
  </div>
</template>

<style>
/* Styles non-scoped pour la modal paramètres */
.settings-modal {
  min-width: 400px;
}

.settings-section {
  margin: 8px 0 16px;
}

.settings-section h3 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.theme-picker {
  display: flex;
  gap: 16px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: none;
  cursor: pointer;
  transition: all 0.15s;
  flex: 1;
  color: var(--text);
  font-size: 13px;
}
.theme-card:hover { border-color: var(--text-muted); }
.theme-card.active { border-color: var(--accent); }

.theme-preview {
  width: 100%;
  height: 70px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  gap: 4px;
  padding: 6px;
}

.theme-preview-dark { background: #1a1a2e; }
.theme-preview-light { background: #f0ede8; }

.tp-sidebar {
  width: 28%;
  border-radius: 3px;
  background: rgba(233,69,96,0.25);
}

.theme-preview-dark .tp-sidebar { background: #16213e; }
.theme-preview-light .tp-sidebar { background: #e4e0d9; }

.tp-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 4px;
}

.tp-line {
  height: 6px;
  border-radius: 3px;
}
.theme-preview-dark .tp-line { background: #2a3a5c; }
.theme-preview-light .tp-line { background: #cdc9c0; }
.tp-line-short { width: 60%; }

/* --- Backups --- */
.backup-info {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 10px;
}
.backup-info code {
  background: var(--input-bg);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 11px;
}
.backup-actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.backup-create-btn { flex-shrink: 0; }
.backup-folder-btn {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  transition: border-color 0.15s;
}
.backup-folder-btn:hover { border-color: var(--accent); color: var(--text); }
.backup-msg {
  font-size: 12px;
  color: var(--success, #4caf50);
  margin: 4px 0 8px;
}
.backup-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  margin-top: 8px;
}
.backup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  gap: 10px;
}
.backup-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.backup-item-date { font-size: 13px; }
.backup-item-size { font-size: 11px; color: var(--text-muted); }
.backup-item-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.backup-btn-restore {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 10px;
  transition: border-color 0.15s;
}
.backup-btn-restore:hover:not(:disabled) { border-color: var(--accent); }
.backup-btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s;
}
.backup-btn-delete:hover:not(:disabled) { color: var(--accent); }
.backup-btn-restore:disabled, .backup-btn-delete:disabled { opacity: 0.4; cursor: default; }
.backup-empty { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; }
.settings-modal { min-width: 480px; max-height: 85vh; overflow-y: auto; }

/* --- Auto-backup --- */
.autobackup-row { margin-bottom: 10px; }
.autobackup-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
}
.autobackup-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.autobackup-interval {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.autobackup-label { font-size: 13px; color: var(--text-muted); }
.autobackup-interval select {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  padding: 5px 10px;
  cursor: pointer;
  outline: none;
}
.autobackup-interval select:hover { border-color: var(--accent); }
.autobackup-note { font-size: 11px; color: var(--text-muted); font-style: italic; }
.autobackup-last { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; }
</style>

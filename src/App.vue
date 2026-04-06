<script setup>
import { ref, provide, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import HomeView from './views/HomeView.vue'
import ProjetView from './views/ProjetView.vue'
import PersonnagesView from './views/PersonnagesView.vue'
import RelationsView from './views/RelationsView.vue'
import TimelineView from './views/TimelineView.vue'
import EcritureView from './views/EcritureView.vue'
import LiminairesView from './views/LiminairesView.vue'
import StatsView from './views/StatsView.vue'

const currentView = ref('home')
const projects = ref([])
const currentProjectId = ref(null)
const characters = ref([])

// ---- Mise à jour ----
const updateVersion = ref(null)

window.api.app.onUpdateAvailable((version) => { updateVersion.value = version })

function openReleasePage() {
  window.api.characterLinks.open('https://github.com/Krystiinal/EcrisTonHistoire/releases/latest')
}

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

// ---- Aide ----
const showHelp = ref(false)
const helpTab  = ref('ecriture')
const helpTabs = [
  { id: 'ecriture',    label: 'Écriture' },
  { id: 'chapitres',   label: 'Chapitres' },
  { id: 'personnages', label: 'Personnages' },
  { id: 'timeline',    label: 'Frise' },
  { id: 'export',      label: 'Export' },
  { id: 'sauvegarde',  label: 'Sauvegardes' },
]

// ---- Rapport de bug ----
const showBugReport = ref(false)
const bugForm = ref({ type: 'bug', title: '', description: '', steps: '', expected: '' })

function openBugReport() {
  bugForm.value = { type: 'bug', title: '', description: '', steps: '', expected: '' }
  showBugReport.value = true
}

function submitBugReport() {
  const f = bugForm.value
  if (!f.title.trim()) return

  const typeLabel = { bug: 'Bug', suggestion: 'Suggestion', amélioration: 'Amélioration' }[f.type] || f.type
  let body = `## Description\n${f.description || '(non renseigné)'}\n\n`
  if (f.type === 'bug') {
    body += `## Étapes pour reproduire\n${f.steps || '(non renseigné)'}\n\n`
    body += `## Comportement attendu\n${f.expected || '(non renseigné)'}\n\n`
  }
  body += `## Informations\n- Type : ${typeLabel}\n- Version : 0.1.7\n- OS : Windows`

  const url = `https://github.com/Krystiinal/EcrisTonHistoire/issues/new?title=${encodeURIComponent(`[${typeLabel}] ${f.title}`)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent(f.type === 'bug' ? 'bug' : 'enhancement')}`
  window.api.characterLinks.open(url)
  showBugReport.value = false
}

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
}

async function loadCharacters() {
  if (!currentProjectId.value) { characters.value = []; return }
  characters.value = await window.api.characters.getAll(currentProjectId.value)
}

async function onSelectProject(id) {
  currentProjectId.value = id
  localStorage.setItem('lastProjectId', id)
  await loadCharacters()
  currentView.value = 'projet'
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
  currentView.value = 'home'
  await loadProjects()
}

function goHome() {
  currentProjectId.value = null
  currentView.value = 'home'
}

async function onProjectUpdated(name) {
  const idx = projects.value.findIndex(p => p.id === currentProjectId.value)
  if (idx !== -1) projects.value[idx].name = name
}

onMounted(loadProjects)
</script>

<template>
  <!-- Bannière mise à jour -->
  <div v-if="updateVersion" class="update-banner">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>v{{ updateVersion }} disponible —</span>
    <a class="update-manual-link" @click="openReleasePage">Télécharger</a>
    <button class="update-banner-close" @click="updateVersion = null"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>

  <div class="app-body">
  <Sidebar
    v-if="currentProjectId"
    :projects="projects"
    :current-project-id="currentProjectId"
    :current-view="currentView"
    @change-view="v => currentView = v"
    @select-project="onSelectProject"
    @new-project="onNewProject"
    @go-home="goHome"
  />

  <main class="main-content">
    <HomeView
      v-if="currentView === 'home'"
      :projects="projects"
      @select-project="onSelectProject"
      @new-project="onNewProject"
    />
    <ProjetView
      v-else-if="currentView === 'projet'"
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
    <StatsView v-else-if="currentView === 'stats'" />
  </main>
  </div><!-- fin .app-body -->

  <!-- Barre de statut globale -->
  <div class="app-status-bar">
    <div class="status-left">
      <button v-if="!currentProjectId" class="status-settings-btn" @click="showSettings = true; loadBackups(); loadAutoBackupSettings()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Paramètres
      </button>
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
        <span class="status-backup-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span>
        <span class="status-text" v-if="autoBackup.lastBackup">
          Backup auto : {{ formatTime(autoBackup.lastBackup) }}
        </span>
        <span class="status-text status-idle" v-else>Backup auto activé</span>
      </template>
      <span class="status-divider"></span>
      <button class="status-icon-btn" title="Aide" @click="showHelp = true; helpTab = 'ecriture'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Aide
      </button>
      <button class="status-icon-btn status-bug-btn" title="Signaler un bug" @click="openBugReport">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2l1.5 1.5"/><path d="M14.5 3.5L16 2"/><path d="M9 7.5A3 3 0 0 0 6 10.5v1a6 6 0 0 0 12 0v-1a3 3 0 0 0-3-3H9z"/><path d="M6.5 10.5H3"/><path d="M20.5 10.5H18"/><path d="M6.5 15.5H3"/><path d="M20.5 15.5H18"/><path d="M9 18.5v2"/><path d="M15 18.5v2"/></svg>
        Bug
      </button>
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
        <p class="backup-info">La base de données est sauvegardée dans <code>%APPDATA%\EcrisTonHistoire\backups\</code></p>

        <div class="backup-actions-row">
          <button class="btn-primary backup-create-btn" :disabled="backupWorking" @click="createBackup">
            {{ backupWorking ? '…' : '+ Créer une sauvegarde' }}
          </button>
          <button class="backup-folder-btn" title="Ouvrir le dossier des sauvegardes" @click="window.api.backup.openFolder()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Ouvrir le dossier</button>
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
              <button class="backup-btn-delete" :disabled="backupWorking" @click="deleteBackup(b.name)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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

  <!-- Modal Aide -->
  <div v-if="showHelp" class="modal-overlay" @click.self="showHelp = false">
    <div class="modal help-modal">
      <div class="help-header">
        <h2>Aide — EcrisTonHistoire</h2>
        <button class="modal-close-btn" @click="showHelp = false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="help-tabs">
        <button
          v-for="tab in helpTabs"
          :key="tab.id"
          class="help-tab"
          :class="{ active: helpTab === tab.id }"
          @click="helpTab = tab.id"
        >{{ tab.label }}</button>
      </div>

      <div class="help-body">

        <!-- ÉCRITURE -->
        <div v-if="helpTab === 'ecriture'">
          <div class="help-section">
            <h3>Barre d'outils de l'éditeur</h3>
            <div class="help-grid">
              <div class="help-item"><span class="help-badge">Aa</span><div><strong>Police &amp; taille</strong><p>Choisissez la famille de police et la taille (en points) via les menus déroulants. Vous pouvez aussi charger vos propres polices depuis le bouton <em>Polices personnalisées</em> dans les paramètres de l'écriture.</p></div></div>
              <div class="help-item"><span class="help-badge">G I S</span><div><strong>Gras, Italique, Souligné, Barré</strong><p>Appliquent le style au texte sélectionné. Raccourcis : <kbd>Ctrl+B</kbd>, <kbd>Ctrl+I</kbd>, <kbd>Ctrl+U</kbd>.</p></div></div>
              <div class="help-item"><span class="help-badge">≡</span><div><strong>Alignement</strong><p>Gauche, centré, droite ou justifié. S'applique au paragraphe courant.</p></div></div>
              <div class="help-item"><span class="help-badge">Abc</span><div><strong>Lettrine</strong><p>Place une grande lettre décorée au début du paragraphe. Cliquez sur le bouton pour ouvrir le panneau : choisissez le nombre de lignes (hauteur) et la police. Cliquez <em>Appliquer</em> pour activer, <em>Retirer</em> pour supprimer.</p></div></div>
              <div class="help-item"><span class="help-badge">¶</span><div><strong>Indentation &amp; espacement</strong><p>Ouvre un panneau pour régler l'indentation de première ligne, l'espace avant et après le paragraphe. Le bouton <em>Appliquer à tous</em> applique les mêmes valeurs à l'ensemble du chapitre.</p></div></div>
              <div class="help-item"><span class="help-badge">H1 H2</span><div><strong>Titres</strong><p>Niveaux de titres 1 à 6 pour structurer le contenu (utile pour les liminaires ou notes).</p></div></div>
              <div class="help-item"><span class="help-badge">🔗</span><div><strong>Lien hypertexte</strong><p>Sélectionnez du texte puis cliquez pour insérer un lien. Ce lien sera cliquable dans l'export Word.</p></div></div>
              <div class="help-item"><span class="help-badge">⌄⌄</span><div><strong>Listes</strong><p>Listes à puces, numérotées ou de tâches (cases à cocher).</p></div></div>
            </div>
          </div>
          <div class="help-section">
            <h3>Rechercher &amp; remplacer</h3>
            <p>Raccourci <kbd>Ctrl+H</kbd> dans l'éditeur. Permet de rechercher un mot ou une expression et de le remplacer dans le chapitre ouvert.</p>
          </div>
          <div class="help-section">
            <h3>Paramètres globaux de mise en page</h3>
            <p>Le bouton <em>Mise en page</em> (icône engrenage) dans la barre haute de l'écriture ouvre un panneau pour régler la police, taille, interligne, marges et indentation par défaut. Ces valeurs s'appliquent à l'affichage et à l'export Word.</p>
          </div>
        </div>

        <!-- CHAPITRES -->
        <div v-if="helpTab === 'chapitres'">
          <div class="help-section">
            <h3>Créer un chapitre</h3>
            <p>Cliquez sur <strong>+ Nouveau chapitre</strong> en bas de la liste. Le chapitre est créé à la fin et nommé automatiquement.</p>
          </div>
          <div class="help-section">
            <h3>Réorganiser</h3>
            <p>Glissez-déposez les chapitres avec l'icône <strong>⠿</strong> (à gauche du titre) pour changer leur ordre. Les chapitres nommés <em>Chapitre N</em> sont renumérotés automatiquement.</p>
          </div>
          <div class="help-section">
            <h3>Menu contextuel (clic droit)</h3>
            <p>Faites un clic droit sur un chapitre pour :</p>
            <ul>
              <li><strong>Insérer avant / après</strong> : crée un nouveau chapitre à la position souhaitée avec renumérotation automatique.</li>
              <li><strong>Supprimer</strong> : supprime le chapitre (confirmation demandée).</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Parties</h3>
            <p>Chaque chapitre peut appartenir à une <em>Partie</em> (ex : "Tome 1", "Acte II"). Modifiez le nom de la partie directement dans l'en-tête de la page d'écriture — tous les chapitres de la même partie sont mis à jour.</p>
          </div>
          <div class="help-section">
            <h3>Statuts</h3>
            <p>Un indicateur de couleur indique l'état du chapitre : <em>brouillon</em>, <em>en cours</em>, <em>terminé</em> ou <em>à réviser</em>. Cliquez sur le point coloré pour changer.</p>
          </div>
        </div>

        <!-- PERSONNAGES -->
        <div v-if="helpTab === 'personnages'">
          <div class="help-section">
            <h3>Fiche personnage</h3>
            <p>Chaque personnage dispose de plusieurs onglets :</p>
            <ul>
              <li><strong>Profil</strong> : nom, âge, description physique et psychologique, notes libres.</li>
              <li><strong>Traits</strong> : liste de traits de caractère personnalisables (forces, faiblesses, habitudes…).</li>
              <li><strong>Arc narratif</strong> : suivez l'évolution du personnage au fil des chapitres.</li>
              <li><strong>Relations</strong> : définissez les liens avec d'autres personnages (ami, ennemi, famille…).</li>
              <li><strong>Inspirations</strong> : associez des images de référence et des liens web (boards d'inspiration, Pinterest…).</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Inspirations — Images</h3>
            <p>Cliquez sur <strong>+ Ajouter une image</strong> pour importer une image depuis votre ordinateur. Elle est stockée dans la base de données.</p>
          </div>
          <div class="help-section">
            <h3>Inspirations — Liens</h3>
            <p>Ajoutez une URL et un libellé. Cliquez sur le lien pour l'ouvrir dans votre navigateur. Les liens apparaissent au-dessus des images.</p>
          </div>
          <div class="help-section">
            <h3>Vue Relations</h3>
            <p>L'onglet <em>Relations</em> dans la navigation affiche une carte visuelle de tous les liens entre personnages.</p>
          </div>
        </div>

        <!-- TIMELINE -->
        <div v-if="helpTab === 'timeline'">
          <div class="help-section">
            <h3>Frise chronologique</h3>
            <p>Créez des événements avec une date, un titre et une description. Les événements sont triés par date et affichés sur une frise visuelle.</p>
          </div>
          <div class="help-section">
            <h3>Associer à des personnages</h3>
            <p>Chaque événement peut être lié à un ou plusieurs personnages de votre projet.</p>
          </div>
          <div class="help-section">
            <h3>Liminaires</h3>
            <p>La section <em>Liminaires</em> permet de créer des pages spéciales (dédicace, épigraphe, avant-propos…) qui seront exportées en début de document Word.</p>
          </div>
        </div>

        <!-- EXPORT -->
        <div v-if="helpTab === 'export'">
          <div class="help-section">
            <h3>Export Word (.docx)</h3>
            <p>Dans la vue Écriture, le bouton <strong>Exporter en Word</strong> génère un fichier <code>.docx</code> compatible Microsoft Word, LibreOffice, etc.</p>
          </div>
          <div class="help-section">
            <h3>Ce qui est exporté</h3>
            <ul>
              <li>Liminaires (si présents)</li>
              <li>Tous les chapitres dans l'ordre, avec leur titre</li>
              <li>Mise en forme : police, taille, gras, italique, souligné, couleur</li>
              <li>Alignement et indentation de paragraphe</li>
              <li>Lettrines (drop cap)</li>
              <li>Liens hypertexte</li>
              <li>Saut de page entre chapitres</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Paramètres d'export</h3>
            <p>Les paramètres de mise en page (police, interligne, marges) définis dans le panneau <em>Mise en page</em> de l'éditeur sont utilisés pour l'export.</p>
          </div>
        </div>

        <!-- SAUVEGARDES -->
        <div v-if="helpTab === 'sauvegarde'">
          <div class="help-section">
            <h3>Sauvegarde automatique des chapitres</h3>
            <p>Le contenu de chaque chapitre est sauvegardé automatiquement <strong>1,5 seconde</strong> après chaque modification. L'indicateur en bas à gauche de l'écran affiche l'état de la sauvegarde.</p>
          </div>
          <div class="help-section">
            <h3>Sauvegarde automatique de la base</h3>
            <p>Activez la sauvegarde automatique dans <em>Paramètres</em> pour créer une copie complète de la base de données à intervalle régulier (15 min à 4h). Les 5 dernières copies sont conservées.</p>
          </div>
          <div class="help-section">
            <h3>Sauvegardes manuelles</h3>
            <p>Dans <em>Paramètres → Sauvegardes manuelles</em>, cliquez sur <strong>+ Créer une sauvegarde</strong> pour prendre un instantané à tout moment. Vous pouvez restaurer ou supprimer n'importe quelle sauvegarde.</p>
          </div>
          <div class="help-section">
            <h3>Emplacement des sauvegardes</h3>
            <p>Les fichiers sont stockés dans <code>%APPDATA%\ecristonhistoire\backups\</code>. Vous pouvez ouvrir ce dossier directement depuis le bouton <em>Ouvrir le dossier</em> dans les paramètres.</p>
          </div>
        </div>

      </div>
      <div class="help-footer">
        <button class="btn-primary" @click="showHelp = false">Fermer</button>
      </div>
    </div>
  </div>

  <!-- Modal Rapport de bug -->
  <div v-if="showBugReport" class="modal-overlay" @click.self="showBugReport = false">
    <div class="modal bug-modal">
      <div class="help-header">
        <h2>Signaler un problème</h2>
        <button class="modal-close-btn" @click="showBugReport = false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="bug-intro">Le formulaire ouvrira une issue GitHub dans votre navigateur. Un compte GitHub est nécessaire pour soumettre.</p>

      <div class="bug-form">
        <div class="bug-field">
          <label>Type</label>
          <div class="bug-type-row">
            <button class="bug-type-btn" :class="{ active: bugForm.type === 'bug' }" @click="bugForm.type = 'bug'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2l1.5 1.5"/><path d="M14.5 3.5L16 2"/><path d="M9 7.5A3 3 0 0 0 6 10.5v1a6 6 0 0 0 12 0v-1a3 3 0 0 0-3-3H9z"/><path d="M6.5 10.5H3"/><path d="M20.5 10.5H18"/><path d="M6.5 15.5H3"/><path d="M20.5 15.5H18"/></svg>
              Bug
            </button>
            <button class="bug-type-btn" :class="{ active: bugForm.type === 'suggestion' }" @click="bugForm.type = 'suggestion'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Suggestion
            </button>
            <button class="bug-type-btn" :class="{ active: bugForm.type === 'amélioration' }" @click="bugForm.type = 'amélioration'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              Amélioration
            </button>
          </div>
        </div>

        <div class="bug-field">
          <label>Titre <span class="required">*</span></label>
          <input v-model="bugForm.title" type="text" class="bug-input" :placeholder="bugForm.type === 'bug' ? 'Ex : La lettrine disparaît après rechargement' : 'Ex : Ajouter un thème sépia'" />
        </div>

        <div class="bug-field">
          <label>Description</label>
          <textarea v-model="bugForm.description" class="bug-textarea" rows="3" :placeholder="bugForm.type === 'bug' ? 'Décrivez ce qui se passe...' : 'Décrivez votre idée...'" />
        </div>

        <template v-if="bugForm.type === 'bug'">
          <div class="bug-field">
            <label>Étapes pour reproduire</label>
            <textarea v-model="bugForm.steps" class="bug-textarea" rows="3" placeholder="1. Ouvrir un chapitre&#10;2. Ajouter une lettrine&#10;3. Changer de chapitre&#10;4. Revenir → la lettrine a disparu" />
          </div>
          <div class="bug-field">
            <label>Comportement attendu</label>
            <textarea v-model="bugForm.expected" class="bug-textarea" rows="2" placeholder="La lettrine devrait rester visible après rechargement." />
          </div>
        </template>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" @click="showBugReport = false">Annuler</button>
        <button class="btn-primary" :disabled="!bugForm.title.trim()" @click="submitBugReport">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
          Ouvrir sur GitHub
        </button>
      </div>
    </div>
  </div>

  <!-- Modal confirmation globale — après toutes les autres modals pour être au premier plan -->
  <div v-if="confirmState.show" class="modal-overlay">
    <div class="modal modal-sm">
      <p>{{ confirmState.message }}</p>
      <div class="modal-actions">
        <button class="btn-secondary" @click="onConfirmCancel">Annuler</button>
        <button class="btn-danger" @click="onConfirmOk">Confirmer</button>
      </div>
    </div>
  </div>
</template>


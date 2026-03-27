<script setup>
import { ref } from 'vue'
import logoUrl from '../assets/logo.png'

const props = defineProps({ projects: Array })
const emit  = defineEmits(['select-project', 'new-project'])

const showNewModal = ref(false)
const newName      = ref('')

const STAGE_LABELS = {
  idee:         '💡 Idée',
  premier_jet:  '✏️ Premier jet',
  correction:   '🔍 Correction',
  publication:  '📚 Publié',
}

function stageLabel(s) { return STAGE_LABELS[s] || s }

const totalWords = () => props.projects.reduce((s, p) => s + (p.word_count || 0), 0)
const totalBooks = () => props.projects.reduce((s, p) => s + (p.books_count || 1), 0)

function confirmNew() {
  const name = newName.value.trim()
  if (!name) return
  showNewModal.value = false
  newName.value = ''
  emit('new-project', name)
}
</script>

<template>
  <div class="home-view">

    <!-- En-tête -->
    <header class="home-header">
      <img :src="logoUrl" alt="EcrisTonHistoire" class="home-logo" />
      <h1 class="home-title">EcrisTonHistoire</h1>
      <p class="home-tagline">Ton appli pour t'aider à faire de tes idées un véritable univers&nbsp;!</p>
    </header>

    <!-- Résumé stats -->
    <div v-if="projects.length > 0" class="home-stats">
      <div class="home-stat-card">
        <span class="home-stat-value">{{ projects.length }}</span>
        <span class="home-stat-label">Projet{{ projects.length > 1 ? 's' : '' }}</span>
      </div>
      <div class="home-stat-card">
        <span class="home-stat-value">{{ totalWords().toLocaleString('fr-FR') }}</span>
        <span class="home-stat-label">Mots écrits</span>
      </div>
      <div class="home-stat-card">
        <span class="home-stat-value">{{ totalBooks() }}</span>
        <span class="home-stat-label">Tome{{ totalBooks() > 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Aucun projet -->
    <div v-if="projects.length === 0" class="home-empty">
      <div class="home-empty-icon">📖</div>
      <p class="home-empty-text">Tu n'as pas encore de projet.<br>Lance-toi&nbsp;!</p>
      <button class="btn-create-first" @click="showNewModal = true">+ Créer ton premier projet</button>
    </div>

    <!-- Grille projets -->
    <div v-else class="home-projects-section">
      <div class="home-section-header">
        <h2 class="home-section-title">Mes projets</h2>
        <button class="btn-new-round" @click="showNewModal = true" title="Ajouter un nouveau projet">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <div class="projects-grid">
        <button
          v-for="p in projects"
          :key="p.id"
          class="project-card"
          @click="emit('select-project', p.id)"
        >
          <div class="project-card-top">
            <span class="project-card-name">{{ p.name }}</span>
            <span class="project-card-stage">{{ stageLabel(p.stage) }}</span>
          </div>
          <p class="project-card-synopsis">
            {{ p.synopsis ? (p.synopsis.length > 160 ? p.synopsis.slice(0, 160) + '…' : p.synopsis) : 'Aucun synopsis.' }}
          </p>
          <div class="project-card-footer">
            <span class="project-card-stat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              {{ (p.word_count || 0).toLocaleString('fr-FR') }} mots
            </span>
            <span class="project-card-stat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              {{ p.books_count || 1 }} tome{{ (p.books_count || 1) > 1 ? 's' : '' }}
            </span>
          </div>
        </button>
      </div>
    </div>

  </div>

  <!-- Modal nouveau projet -->
  <div v-if="showNewModal" class="modal-overlay" @click.self="showNewModal = false">
    <div class="modal">
      <h2>Nouveau projet</h2>
      <label>Nom du projet
        <input
          v-model="newName"
          type="text"
          placeholder="Ex : Le Silence des Cendres"
          @keydown.enter="confirmNew"
          @keydown.escape="showNewModal = false"
          autofocus
        >
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" @click="showNewModal = false">Annuler</button>
        <button class="btn-primary" @click="confirmNew">Créer</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout principal ── */
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 48px 48px;
  overflow-y: auto;
  background: var(--color-bg);
}

/* ── En-tête ── */
.home-header {
  text-align: center;
  margin-bottom: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.home-logo {
  width: 88px;
  height: 88px;
  margin-bottom: 4px;
  /* Thème sombre : plume blanche avec teinte rose */
  filter: invert(1) drop-shadow(0 4px 16px rgba(233, 69, 96, 0.4));
}

/* Note: light theme logo filter is in the non-scoped <style> block below */

.home-title {
  font-size: 48px;
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: -1px;
  margin: 0;
  line-height: 1.1;
}

.home-tagline {
  font-size: 15px;
  color: var(--color-muted);
  font-style: italic;
  margin: 0;
  line-height: 1.6;
}

/* ── Stats ── */
.home-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 44px;
}

.home-stat-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 120px;
  transition: border-color 0.15s, transform 0.15s;
}
.home-stat-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
}

.home-stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--color-accent);
  line-height: 1;
}

.home-stat-label {
  font-size: 11px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

/* ── Aucun projet ── */
.home-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: 60px;
  padding: 48px;
  background: var(--color-card);
  border: 1px dashed var(--color-border);
  border-radius: 20px;
  max-width: 400px;
  width: 100%;
}

.home-empty-icon {
  font-size: 64px;
  line-height: 1;
}

.home-empty-text {
  font-size: 16px;
  color: var(--color-muted);
  text-align: center;
  line-height: 1.7;
  margin: 0;
}

.btn-create-first {
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 13px 32px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  letter-spacing: 0.02em;
}
.btn-create-first:hover {
  background: var(--color-accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(233, 69, 96, 0.35);
}

/* ── Section projets ── */
.home-projects-section {
  width: 100%;
  max-width: 980px;
}

.home-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.home-section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-tx);
  margin: 0;
  letter-spacing: -0.3px;
}

.btn-new-round {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  background: none;
  color: var(--color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
  padding: 0;
  outline: none;
}
.btn-new-round:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  transform: rotate(90deg);
  background: rgba(233, 69, 96, 0.08);
}

/* ── Grille projets ── */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.project-card {
  background: var(--color-sidebar);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 22px 24px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s, background 0.15s;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  overflow: hidden;
}
.project-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-accent);
  opacity: 0;
  transition: opacity 0.2s;
}
.project-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  background: var(--color-card);
}
.project-card:hover::before {
  opacity: 1;
}

.project-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.project-card-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-tx);
  line-height: 1.3;
}

.project-card-stage {
  font-size: 11px;
  color: var(--color-muted);
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 3px 8px;
  white-space: nowrap;
  flex-shrink: 0;
  font-weight: 500;
}

.project-card-synopsis {
  font-size: 13px;
  color: var(--color-muted);
  line-height: 1.6;
  margin: 0;
  flex: 1;
}

.project-card-footer {
  display: flex;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-top: auto;
}

.project-card-stat {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 500;
}
</style>

<style>
/* Filtre logo thème clair — doit être non-scopé pour cibler html.theme-light correctement */
html.theme-light .home-logo {
  filter: invert(28%) sepia(85%) saturate(1200%) hue-rotate(325deg) brightness(100%)
          drop-shadow(0 4px 12px rgba(233, 69, 96, 0.25));
}
</style>

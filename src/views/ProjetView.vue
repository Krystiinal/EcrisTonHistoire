<script setup>
import { ref, watch, onMounted, inject } from 'vue'

const props = defineProps({ projectId: Number })
const emit = defineEmits(['updated', 'deleted'])
const confirm = inject('confirm')

const hasProject = ref(false)
const form = ref({ name: '', synopsis: '', stage: 'idee', books_count: 1, notes: '' })
const autoWordCount = ref(0)
const saveBtn = ref(null)

async function load() {
  if (!props.projectId) { hasProject.value = false; return }
  const [proj, wc] = await Promise.all([
    window.api.projects.get(props.projectId),
    window.api.projects.wordCount(props.projectId),
  ])
  if (!proj) { hasProject.value = false; return }
  hasProject.value = true
  autoWordCount.value = wc ?? 0
  form.value = {
    name: proj.name || '',
    synopsis: proj.synopsis || '',
    stage: proj.stage || 'idee',
    books_count: proj.books_count ?? 1,
    notes: proj.notes || '',
  }
}

async function save() {
  await window.api.projects.update(props.projectId, { ...form.value })
  emit('updated', form.value.name)
  flash()
}

async function deleteProject() {
  const ok = await confirm(`Supprimer "${form.value.name}" et tous ses personnages ? Cette action est irréversible.`)
  if (!ok) return
  await window.api.projects.delete(props.projectId)
  emit('deleted')
}

function flash() {
  const btn = saveBtn.value
  if (!btn) return
  const orig = btn.textContent
  btn.textContent = '✓ Enregistré'
  btn.style.background = 'var(--color-success)'
  setTimeout(() => { btn.textContent = orig; btn.style.background = '' }, 1500)
}

watch(() => props.projectId, load)
onMounted(load)
</script>

<template>
  <div class="view-inner">
    <div v-if="!hasProject" class="empty-state">
      <p>Crée un projet pour commencer.</p>
    </div>

    <div v-else class="project-dashboard">
      <!-- Titre -->
      <div class="project-title-row">
        <input v-model="form.name" type="text" class="project-name-input" placeholder="Nom du projet">
      </div>

      <!-- Layout 2 colonnes -->
      <div class="project-content-grid">

        <!-- Colonne principale -->
        <div class="project-main-col">
          <label>Synopsis
            <textarea v-model="form.synopsis" rows="6" placeholder="De quoi parle ton histoire ?"></textarea>
          </label>
          <label>Notes
            <textarea v-model="form.notes" rows="10" placeholder="Idées, rappels, pistes à explorer..."></textarea>
          </label>
        </div>

        <!-- Colonne méta -->
        <div class="project-side-col">
          <div class="meta-card">
            <span class="meta-label">Avancement</span>
            <select v-model="form.stage">
              <option value="idee">💡 Idée</option>
              <option value="plan">📋 Planification</option>
              <option value="premier_jet">✍️ Premier jet</option>
              <option value="revision">🔍 Révision</option>
              <option value="finalise">✅ Finalisé</option>
            </select>
          </div>
          <div class="meta-card">
            <span class="meta-label">Mots écrits</span>
            <div class="meta-number-row">
              <span class="meta-word-count">{{ autoWordCount.toLocaleString('fr-FR') }}</span>
              <span class="meta-unit">mots</span>
            </div>
            <span class="meta-sublabel">comptage automatique des chapitres</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Nombre de tomes</span>
            <div class="meta-number-row">
              <input v-model.number="form.books_count" type="number" min="1" placeholder="1">
              <span class="meta-unit">tome(s)</span>
            </div>
          </div>
        </div>

      </div>

      <div class="project-actions">
        <button ref="saveBtn" class="btn-primary" @click="save">Enregistrer</button>
        <button class="btn-danger" @click="deleteProject">Supprimer le projet</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ───────────────────────────────────────────── */
.view-inner {
  padding: 32px 40px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  font-size: 14px;
}

.project-dashboard {
  display: flex;
  flex-direction: column;
  gap: 28px;
  flex: 1;
}

/* ── Titre du projet ──────────────────────────────────── */
.project-title-row {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 20px;
}

.project-name-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-size: 26px;
  font-weight: 700;
  color: var(--color-tx);
  letter-spacing: -0.02em;
  padding: 0;
}

.project-name-input::placeholder {
  color: var(--color-muted);
  opacity: 0.6;
}

/* ── Grille 2 colonnes ────────────────────────────────── */
.project-content-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 24px;
  flex: 1;
}

/* ── Colonne principale ───────────────────────────────── */
.project-main-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.project-main-col label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-muted);
}

.project-main-col textarea {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-input);
  color: var(--color-tx);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease;
  font-family: inherit;
}

.project-main-col textarea:focus {
  border-color: var(--color-accent);
}

/* ── Colonne méta ─────────────────────────────────────── */
.project-side-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.meta-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow 0.2s ease;
}

.meta-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

.meta-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-muted);
}

.meta-card select {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-input);
  color: var(--color-tx);
  font-size: 13px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.meta-card select:focus {
  border-color: var(--color-accent);
}

.meta-number-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.meta-word-count {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: -0.02em;
  line-height: 1;
}

.meta-unit {
  font-size: 13px;
  color: var(--color-muted);
}

.meta-sublabel {
  font-size: 11px;
  color: var(--color-muted);
  opacity: 0.7;
}

.meta-card input[type="number"] {
  width: 72px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-input);
  color: var(--color-tx);
  font-size: 14px;
  font-weight: 600;
  outline: none;
  transition: border-color 0.2s ease;
}

.meta-card input[type="number"]:focus {
  border-color: var(--color-accent);
}

/* ── Actions ──────────────────────────────────────────── */
.project-actions {
  display: flex;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}
</style>

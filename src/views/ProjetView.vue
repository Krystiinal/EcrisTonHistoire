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
  btn.style.background = 'var(--success)'
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

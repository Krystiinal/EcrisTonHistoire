<script setup>
import { ref, computed, watch } from 'vue'
import { TL_COLORS, TL_DEFAULT } from '../constants.js'

const props = defineProps({ projectId: Number })

const events = ref([])
const search = ref('')
const activeTypes = ref(new Set())
const showEventModal = ref(false)
const editingEvent = ref(null)
const eventForm = ref({ date: '', type: '', desc: '', chars: '', lieu: '' })

const allTypes = computed(() => [...new Set(events.value.map(e => e.type))].sort())

const dateRange = computed(() => {
  if (!events.value.length) return ''
  const sorted = [...events.value].sort((a, b) => a.date - b.date)
  return `${sorted[0].date} à ${sorted[sorted.length - 1].date} p.a.`
})

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return events.value
    .filter(e => activeTypes.value.size === 0 || activeTypes.value.has(e.type))
    .filter(e => !q || e.desc.toLowerCase().includes(q) || (e.chars || '').toLowerCase().includes(q) || (e.lieu || '').toLowerCase().includes(q))
    .sort((a, b) => a.date - b.date)
})

function toggleType(t) {
  const s = new Set(activeTypes.value)
  if (s.has(t)) s.delete(t); else s.add(t)
  activeTypes.value = s
}

async function load() {
  if (!props.projectId) { events.value = []; return }
  events.value = await window.api.timeline.getAll(props.projectId)
}

function openEventModal(ev = null) {
  editingEvent.value = ev
  eventForm.value = {
    date: ev ? ev.date : '',
    type: ev ? ev.type : '',
    desc: ev ? ev.desc : '',
    chars: ev ? (ev.chars || '') : '',
    lieu: ev ? (ev.lieu || '') : '',
  }
  showEventModal.value = true
}

async function saveEvent() {
  const data = {
    date: parseInt(eventForm.value.date),
    type: eventForm.value.type.trim(),
    desc: eventForm.value.desc.trim(),
    chars: eventForm.value.chars.trim(),
    lieu: eventForm.value.lieu.trim(),
  }
  if (!data.date || !data.type || !data.desc) return
  if (editingEvent.value) {
    await window.api.timeline.update(editingEvent.value.id, data)
  } else {
    await window.api.timeline.create({ ...data, project_id: props.projectId })
  }
  showEventModal.value = false
  await load()
}

async function deleteEvent(id) {
  if (!confirm('Supprimer cet événement ?')) return
  await window.api.timeline.delete(id)
  await load()
}

watch(() => props.projectId, load, { immediate: true })
</script>

<template>
  <div class="view-inner">
    <div class="timeline-header">
      <div class="tl-title-row">
        <h2 class="timeline-title">Chronologie</h2>
        <button class="btn-primary" @click="openEventModal()">+ Événement</button>
      </div>
      <p v-if="dateRange" class="timeline-subtitle">{{ dateRange }}</p>
      <div class="timeline-controls">
        <div class="timeline-search-wrap">
          <span class="tl-search-icon">⌕</span>
          <input id="tl-search" v-model="search" type="text" placeholder="Rechercher un événement, personnage ou lieu...">
        </div>
        <div class="tl-filters">
          <button
            v-for="t in allTypes" :key="t"
            class="tl-filter-btn"
            :class="{ active: activeTypes.has(t) }"
            :style="{ '--tl-accent': (TL_COLORS[t] || TL_DEFAULT).accent }"
            @click="toggleType(t)"
          >{{ (TL_COLORS[t] || TL_DEFAULT).icon }} {{ t }}</button>
        </div>
        <p class="tl-count">{{ filtered.length }} événement{{ filtered.length > 1 ? 's' : '' }} affiché{{ filtered.length > 1 ? 's' : '' }}</p>
      </div>
    </div>

    <div class="timeline-list">
      <div
        v-for="(ev, idx) in filtered"
        :key="ev.id"
        class="tl-item"
        :class="idx % 2 === 0 ? 'tl-left' : 'tl-right'"
      >
        <div
          class="tl-card"
          :style="{ '--tl-accent': (TL_COLORS[ev.type] || TL_DEFAULT).accent, '--tl-bg': (TL_COLORS[ev.type] || TL_DEFAULT).bg }"
        >
          <div class="tl-date">{{ ev.date }} p.a.</div>
          <div class="tl-type-badge">{{ (TL_COLORS[ev.type] || TL_DEFAULT).icon }} {{ ev.type }}</div>
          <p class="tl-desc">{{ ev.desc }}</p>
          <div class="tl-meta">
            <span v-if="ev.chars">👤 {{ ev.chars }}</span>
            <span v-if="ev.lieu">📍 {{ ev.lieu }}</span>
          </div>
          <div class="tl-card-actions">
            <button class="btn-secondary tl-btn-edit" @click="openEventModal(ev)">Modifier</button>
            <button class="btn-danger" @click="deleteEvent(ev.id)">×</button>
          </div>
        </div>
        <div class="tl-dot" :style="{ background: (TL_COLORS[ev.type] || TL_DEFAULT).accent }"></div>
      </div>
    </div>
  </div>

  <!-- Modal événement -->
  <div v-if="showEventModal" class="modal-overlay">
    <div class="modal modal-wide">
      <h2>{{ editingEvent ? "Modifier l'événement" : 'Nouvel événement' }}</h2>
      <div class="form-grid">
        <label>Date (p.a.) <input v-model="eventForm.date" type="number" placeholder="-5495"></label>
        <label>Type
          <input v-model="eventForm.type" type="text" list="tl-types-datalist" placeholder="Bataille, Naissance...">
          <datalist id="tl-types-datalist">
            <option v-for="t in Object.keys(TL_COLORS)" :key="t" :value="t"></option>
          </datalist>
        </label>
      </div>
      <label class="full-width">Description
        <textarea v-model="eventForm.desc" rows="3" placeholder="Ce qui s'est passé..."></textarea>
      </label>
      <label>Personnages impliqués <input v-model="eventForm.chars" type="text" placeholder="Urval, Satel..."></label>
      <label>Lieu <input v-model="eventForm.lieu" type="text" placeholder="Stalun, Xénos..."></label>
      <div class="modal-actions">
        <button class="btn-secondary" @click="showEventModal = false">Annuler</button>
        <button class="btn-primary" @click="saveEvent">Enregistrer</button>
      </div>
    </div>
  </div>
</template>

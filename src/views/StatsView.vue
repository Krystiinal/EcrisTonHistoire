<script setup>
import { ref, computed, onMounted } from 'vue'

const summary = ref({ today: 0, week: 0, month: 0 })
const history = ref([])
const goals = ref([])
const editingGoal = ref(null)

const GOAL_TYPES = [
  { type: 'daily',   label: 'Journalier' },
  { type: 'weekly',  label: 'Hebdomadaire' },
  { type: 'monthly', label: 'Mensuel' },
]

const goalMap = computed(() => {
  const m = {}
  for (const g of goals.value) m[g.type] = g
  return m
})

const dailyGoal   = computed(() => goalMap.value.daily?.target   ?? 0)
const weeklyGoal  = computed(() => goalMap.value.weekly?.target  ?? 0)
const monthlyGoal = computed(() => goalMap.value.monthly?.target ?? 0)

function progress(current, target) {
  return target ? Math.min(100, Math.round(current / target * 100)) : 0
}

// Historique : 30 derniers jours agrégés par date
const historyByDate = computed(() => {
  const map = {}
  for (const row of history.value) {
    map[row.date] = (map[row.date] || 0) + row.total
  }
  const result = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().split('T')[0]
    result.push({ date, total: map[date] || 0 })
  }
  return result
})

const maxDay = computed(() => Math.max(...historyByDate.value.map(d => d.total), 1))

const todayStr = new Date().toISOString().split('T')[0]

function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

async function load() {
  const [s, h, g] = await Promise.all([
    window.api.stats.getSummary(),
    window.api.stats.getHistory(30),
    window.api.stats.getGoals(),
  ])
  summary.value = s
  history.value = h
  goals.value = g
}

function startEditGoal(type) {
  editingGoal.value = { type, target: goalMap.value[type]?.target ?? '' }
}

async function saveGoal() {
  if (!editingGoal.value?.target) return
  await window.api.stats.setGoal(editingGoal.value.type, parseInt(editingGoal.value.target))
  editingGoal.value = null
  goals.value = await window.api.stats.getGoals()
}

async function deleteGoal(type) {
  await window.api.stats.deleteGoal(type)
  goals.value = await window.api.stats.getGoals()
}

onMounted(load)
</script>

<template>
  <div class="stats-view">
    <div class="stats-header">
      <h2>Statistiques d'écriture</h2>
    </div>

    <!-- Cards résumé -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-value">{{ summary.today.toLocaleString('fr-FR') }}</div>
        <div class="stat-label">mots aujourd'hui</div>
        <template v-if="dailyGoal">
          <div class="stat-progress-bar">
            <div class="stat-progress-fill" :style="`width:${progress(summary.today, dailyGoal)}%`"></div>
          </div>
          <div class="stat-progress-text">{{ progress(summary.today, dailyGoal) }}% — objectif {{ dailyGoal.toLocaleString('fr-FR') }}</div>
        </template>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ summary.week.toLocaleString('fr-FR') }}</div>
        <div class="stat-label">mots cette semaine</div>
        <template v-if="weeklyGoal">
          <div class="stat-progress-bar">
            <div class="stat-progress-fill" :style="`width:${progress(summary.week, weeklyGoal)}%`"></div>
          </div>
          <div class="stat-progress-text">{{ progress(summary.week, weeklyGoal) }}% — objectif {{ weeklyGoal.toLocaleString('fr-FR') }}</div>
        </template>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ summary.month.toLocaleString('fr-FR') }}</div>
        <div class="stat-label">mots ce mois-ci</div>
        <template v-if="monthlyGoal">
          <div class="stat-progress-bar">
            <div class="stat-progress-fill" :style="`width:${progress(summary.month, monthlyGoal)}%`"></div>
          </div>
          <div class="stat-progress-text">{{ progress(summary.month, monthlyGoal) }}% — objectif {{ monthlyGoal.toLocaleString('fr-FR') }}</div>
        </template>
      </div>
    </div>

    <!-- Graphique 30 jours -->
    <div class="stats-section">
      <h3>Activité — 30 derniers jours</h3>
      <div class="bar-chart">
        <div
          v-for="day in historyByDate"
          :key="day.date"
          class="bar-col"
          :title="`${formatDate(day.date)} : ${day.total.toLocaleString('fr-FR')} mots`"
        >
          <div
            class="bar"
            :class="{ today: day.date === todayStr, empty: day.total === 0 }"
            :style="`height: ${Math.max(2, Math.round((day.total / maxDay) * 100))}%`"
          ></div>
          <span class="bar-label">{{ formatDate(day.date) }}</span>
        </div>
      </div>
    </div>

    <!-- Objectifs -->
    <div class="stats-section">
      <h3>Objectifs</h3>
      <div class="goals-list">
        <div v-for="gt in GOAL_TYPES" :key="gt.type" class="goal-row">
          <span class="goal-type-label">{{ gt.label }}</span>
          <template v-if="editingGoal?.type === gt.type">
            <input
              v-model="editingGoal.target"
              type="number" min="1"
              placeholder="Nombre de mots"
              class="goal-input"
              @keydown.enter="saveGoal"
              @keydown.escape="editingGoal = null"
            >
            <button class="btn-primary btn-sm" @click="saveGoal">OK</button>
            <button class="btn-secondary btn-sm" @click="editingGoal = null">✕</button>
          </template>
          <template v-else>
            <span class="goal-value">{{ goalMap[gt.type] ? goalMap[gt.type].target.toLocaleString('fr-FR') + ' mots' : '—' }}</span>
            <button class="btn-secondary btn-sm" @click="startEditGoal(gt.type)">
              {{ goalMap[gt.type] ? 'Modifier' : 'Définir' }}
            </button>
            <button v-if="goalMap[gt.type]" class="btn-danger btn-sm" @click="deleteGoal(gt.type)">✕</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-view {
  padding: 32px 40px;
  overflow-y: auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.stats-header h2 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--color-tx);
  letter-spacing: -0.01em;
}

/* Cards */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: box-shadow 0.2s ease;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--color-accent);
  line-height: 1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 13px;
  color: var(--color-muted);
  margin-top: 2px;
}

.stat-progress-bar {
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 8px;
}

.stat-progress-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.stat-progress-text {
  font-size: 11px;
  color: var(--color-muted);
  margin-top: 2px;
}

/* Sections */
.stats-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stats-section h3 {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}

/* Graphique */
.bar-chart {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px 12px 0;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 150px;
  padding-bottom: 24px;
  position: relative;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 3px;
}

.bar {
  width: 100%;
  background: var(--color-accent);
  border-radius: 3px 3px 0 0;
  opacity: 0.6;
  min-height: 2px;
  transition: height 0.3s ease, opacity 0.2s ease;
}

.bar:hover {
  opacity: 1;
}

.bar.today {
  opacity: 1;
  background: var(--color-accent);
  box-shadow: 0 0 8px var(--color-accent);
}

.bar.empty {
  background: var(--color-border);
  opacity: 0.5;
}

.bar-label {
  font-size: 9px;
  color: var(--color-muted);
  white-space: nowrap;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  height: 20px;
  line-height: 1;
}

/* Objectifs */
.goals-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.goal-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px 16px;
  transition: border-color 0.2s ease;
}

.goal-row:hover {
  border-color: var(--color-accent);
}

.goal-type-label {
  font-size: 13px;
  font-weight: 600;
  width: 130px;
  flex-shrink: 0;
  color: var(--color-tx);
}

.goal-value {
  flex: 1;
  font-size: 13px;
  color: var(--color-muted);
}

.goal-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-input);
  color: var(--color-tx);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease;
}

.goal-input:focus {
  border-color: var(--color-accent);
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
}
</style>

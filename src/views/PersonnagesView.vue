<script setup>
import { ref, computed, inject, watch, nextTick } from 'vue'

const props = defineProps({ projectId: Number, characters: Array })

const emit = defineEmits(['characters-changed'])
const confirm = inject('confirm')

// État
const currentChar = ref(null)
const currentTab = ref('identity')
const traits = ref([])
const arcs = ref([])
const importance = ref(0)
const images = ref([])
const charRelations = ref([])

// Modal nouveau personnage
const showModal = ref(false)
const modalName = ref('')
const modalOrigin = ref('')
const modalRole = ref('secondaire')

// Formulaire personnage
const form = ref({
  name: '', name_translation: '', role: 'secondaire', origin: '',
  age: '', gender: '', appearance: '', motivation: '', fears: '', secrets: '', notes: '', background: ''
})

// Origines déjà utilisées dans ce projet (pour autocomplétion)
const projectOrigins = computed(() => {
  const set = new Set((props.characters || []).map(c => c.origin).filter(Boolean))
  return [...set].sort()
})

// Boutons de sauvegarde
const saveBtns = ref({})

// Grouper les personnages par origine
const grouped = computed(() => {
  const groups = {}
  for (const c of (props.characters || [])) {
    const key = c.origin || 'Sans origine'
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (b.importance || 0) - (a.importance || 0) || a.name.localeCompare(b.name))
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([origin, chars]) => ({ origin, chars }))
})

function starsArr(n) { return Array.from({ length: 5 }, (_, i) => i < n) }

async function openCharacter(id) {
  const char = await window.api.characters.get(id)
  currentChar.value = char
  form.value = {
    name: char.name || '',
    name_translation: char.name_translation || '',
    role: char.role || 'secondaire',
    origin: char.origin || '',
    age: char.age || '',
    gender: char.gender || '',
    appearance: char.appearance || '',
    motivation: char.motivation || '',
    fears: char.fears || '',
    secrets: char.secrets || '',
    notes: char.notes || '',
    background: char.background || '',
  }
  importance.value = char.importance || 0
  traits.value = await window.api.traits.getAll(id)
  arcs.value = await window.api.arcs.getAll(id)
  images.value = await window.api.characterImages.getAll(id)
  const allRels = await window.api.relationships.getAll(props.projectId)
  charRelations.value = allRels.filter(r => r.character_a_id === id || r.character_b_id === id)
  currentTab.value = 'identity'
}

async function saveCharacter() {
  if (!currentChar.value) return
  const updated = await window.api.characters.update(currentChar.value.id, {
    ...form.value,
    importance: importance.value,
  })
  currentChar.value = updated
  emit('characters-changed')
  flash('identity')
}

async function saveBackground() {
  if (!currentChar.value) return
  await window.api.characters.update(currentChar.value.id, { background: form.value.background })
  emit('characters-changed')
  flash('background')
}

async function deleteCharacter() {
  if (!currentChar.value) return
  const ok = await confirm(`Supprimer "${currentChar.value.name}" ? Cette action est irréversible.`)
  if (!ok) return
  await window.api.characters.delete(currentChar.value.id)
  currentChar.value = null
  emit('characters-changed')
}

// Traits
const newTrait = ref('')
const newTraitType = ref('neutre')
function addTrait() {
  if (!newTrait.value.trim()) return
  traits.value.push({ trait: newTrait.value.trim(), type: newTraitType.value })
  newTrait.value = ''
}
function removeTrait(i) { traits.value.splice(i, 1) }
async function saveTraits() {
  if (!currentChar.value) return
  try {
    const plain = traits.value.map(t => ({ trait: t.trait, type: t.type }))
    traits.value = await window.api.traits.save(currentChar.value.id, plain)
    flash('traits')
  } catch (e) {
    console.error('saveTraits error:', e)
  }
}

// Arcs
function addArc() { arcs.value.push({ title: '', description: '', phase: 'debut' }) }
function removeArc(i) { arcs.value.splice(i, 1) }
async function saveArcs() {
  if (!currentChar.value) return
  try {
    const plain = arcs.value.map(a => ({ title: a.title, description: a.description, phase: a.phase }))
    arcs.value = await window.api.arcs.save(currentChar.value.id, plain)
    flash('arcs')
  } catch (e) {
    console.error('saveArcs error:', e)
  }
}

// Nouveau personnage
async function createCharacter() {
  const name = modalName.value.trim()
  if (!name) return
  showModal.value = false
  const char = await window.api.characters.create({
    project_id: props.projectId, name, role: modalRole.value, origin: modalOrigin.value
  })
  emit('characters-changed')
  await openCharacter(char.id)
  nextTick(() => {
    document.querySelector('.character-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function flash(key) {
  const btn = saveBtns.value[key]
  if (!btn) return
  const orig = btn.textContent
  btn.textContent = '✓ Enregistré'
  btn.style.background = 'var(--success)'
  setTimeout(() => { btn.textContent = orig; btn.style.background = '' }, 1500)
}

// Images
async function pickImage() {
  if (!currentChar.value || images.value.length >= 4) return
  const img = await window.api.characterImages.pick(currentChar.value.id)
  if (img) images.value.push(img)
}

async function deleteImage(img) {
  await window.api.characterImages.delete(img.id)
  images.value = images.value.filter(i => i.id !== img.id)
}

// Réinitialiser si le projet change
watch(() => props.projectId, () => { currentChar.value = null; images.value = [] })
</script>

<template>
  <div class="view-inner view-characters-inner">
    <!-- Panneau gauche : liste -->
    <div class="char-list-panel">
      <button class="btn-primary char-add-btn" @click="showModal = true">+ Personnage</button>

      <div id="characters-list">
        <template v-if="grouped.length === 0">
          <p style="padding:12px 16px;color:var(--text-muted);font-size:13px">Aucun personnage</p>
        </template>
        <template v-for="group in grouped" :key="group.origin">
          <div class="char-origin-group">{{ group.origin }}</div>
          <div
            v-for="c in group.chars"
            :key="c.id"
            class="character-item"
            :class="{ active: currentChar?.id === c.id }"
            @click="openCharacter(c.id)"
          >
            <span>{{ c.name }}</span>
            <span v-if="c.importance" class="char-stars">
              <span v-for="(on, i) in starsArr(c.importance)" :key="i">{{ on ? '★' : '☆' }}</span>
            </span>
          </div>
        </template>
      </div>
    </div>

    <!-- Panneau droit : détail -->
    <div class="char-detail-panel">
      <div v-if="!currentChar" class="char-detail-empty">
        <p>Sélectionne un personnage dans la liste</p>
      </div>

      <template v-else>
        <!-- Header personnage -->
        <div class="character-header">
          <div class="char-name-block">
            <input v-model="form.name" type="text" placeholder="Nom du personnage" class="char-name-input">
            <input v-model="form.name_translation" type="text" placeholder="Traduction du nom..." class="char-name-translation-input">
          </div>
          <select v-model="form.role" title="Rôle">
            <option value="protagoniste">Protagoniste</option>
            <option value="antagoniste">Antagoniste</option>
            <option value="secondaire">Secondaire</option>
          </select>
          <input
            v-model="form.origin"
            type="text"
            list="origins-datalist"
            placeholder="Origine..."
            class="origin-input"
            title="Origine"
          >
          <datalist id="origins-datalist">
            <option v-for="o in projectOrigins" :key="o" :value="o"></option>
          </datalist>
          <!-- Étoiles d'importance -->
          <div class="star-rating">
            <span
              v-for="i in 5" :key="i"
              class="star"
              :class="{ active: i <= importance }"
              @click="importance = importance === i ? 0 : i"
            >★</span>
          </div>
          <button class="btn-danger" @click="deleteCharacter">Supprimer</button>
        </div>

        <!-- Onglets -->
        <div class="tabs">
          <button v-for="tab in ['identity','background','traits','arcs','relations','images']" :key="tab"
            class="tab-btn" :class="{ active: currentTab === tab }"
            @click="currentTab = tab">
            {{ { identity: 'Identité', background: 'Backstory', traits: 'Traits', arcs: 'Arc narratif', relations: 'Relations', images: 'Inspirations' }[tab] }}
          </button>
        </div>

        <!-- Onglet Identité -->
        <div v-show="currentTab === 'identity'" class="tab-content active" style="display:flex">
          <div class="form-grid">
            <label>Âge <input v-model="form.age" type="text" placeholder="Ex: 28 ans"></label>
            <label>Genre <input v-model="form.gender" type="text" placeholder="Ex: Femme"></label>
          </div>
          <label class="full-width">Apparence physique
            <textarea v-model="form.appearance" rows="4" placeholder="Décris l'apparence..."></textarea>
          </label>
          <label class="full-width">Motivations
            <textarea v-model="form.motivation" rows="3" placeholder="Qu'est-ce qui le/la motive ?"></textarea>
          </label>
          <label class="full-width">Peurs
            <textarea v-model="form.fears" rows="3" placeholder="Ses peurs, ses failles..."></textarea>
          </label>
          <label class="full-width">Secrets
            <textarea v-model="form.secrets" rows="3" placeholder="Ce que les autres ignorent..."></textarea>
          </label>
          <label class="full-width">Notes libres
            <textarea v-model="form.notes" rows="3" placeholder="Tout ce qui ne rentre pas ailleurs..."></textarea>
          </label>
          <button :ref="el => saveBtns['identity'] = el" class="btn-primary" @click="saveCharacter">Enregistrer</button>
        </div>

        <!-- Onglet Backstory -->
        <div v-show="currentTab === 'background'" class="tab-content active" style="display:flex">
          <label class="full-width">Histoire passée (Backstory)
            <textarea v-model="form.background" rows="20" placeholder="Raconte l'histoire du personnage..."></textarea>
          </label>
          <button :ref="el => saveBtns['background'] = el" class="btn-primary" @click="saveBackground">Enregistrer</button>
        </div>

        <!-- Onglet Traits -->
        <div v-show="currentTab === 'traits'" class="tab-content active" style="display:flex">
          <p class="hint">Ajoute des traits de personnalité (courageux, impulsif, loyal...)</p>
          <div class="traits-container">
            <span v-for="(t, i) in traits" :key="i" class="trait-tag" :class="t.type">
              {{ t.trait }}
              <button @click.stop="removeTrait(i)" title="Supprimer">×</button>
            </span>
          </div>
          <div class="trait-add-row">
            <input v-model="newTrait" type="text" placeholder="Nouveau trait..." @keydown.enter="addTrait">
            <select v-model="newTraitType">
              <option value="positif">Positif</option>
              <option value="negatif">Négatif</option>
              <option value="neutre">Neutre</option>
            </select>
            <button class="btn-primary" @click="addTrait">Ajouter</button>
          </div>
          <button :ref="el => saveBtns['traits'] = el" class="btn-primary" @click="saveTraits">Enregistrer les traits</button>
        </div>

        <!-- Onglet Arcs -->
        <div v-show="currentTab === 'arcs'" class="tab-content active" style="display:flex">
          <p class="hint">Décris l'évolution du personnage au fil du récit.</p>
          <div class="arcs-list">
            <div v-for="(arc, i) in arcs" :key="i" class="arc-item">
              <div class="arc-item-header">
                <input v-model="arc.title" type="text" class="arc-title" placeholder="Titre de l'étape">
                <select v-model="arc.phase" class="arc-phase">
                  <option value="debut">Début</option>
                  <option value="milieu">Milieu</option>
                  <option value="fin">Fin</option>
                </select>
                <button class="btn-remove-arc" @click="removeArc(i)">×</button>
              </div>
              <textarea v-model="arc.description" class="arc-description" rows="3" placeholder="Décris cette étape..."></textarea>
            </div>
          </div>
          <button class="btn-secondary" @click="addArc">+ Ajouter une étape</button>
          <button :ref="el => saveBtns['arcs'] = el" class="btn-primary" @click="saveArcs">Enregistrer l'arc</button>
        </div>

        <!-- Onglet Relations -->
        <div v-show="currentTab === 'relations'" class="tab-content active" style="display:flex">
          <p class="hint">Relations de ce personnage avec les autres.</p>
          <div v-if="charRelations.length === 0" style="color:var(--text-muted);font-size:13px">
            Aucune relation enregistrée pour ce personnage.
          </div>
          <div v-else class="char-relations-list">
            <div v-for="r in charRelations" :key="r.id" class="char-rel-item">
              <div class="char-rel-other">
                {{ r.character_a_id === currentChar.id ? r.character_b_name : r.character_a_name }}
              </div>
              <span class="rel-type-badge">{{ r.relation_type }}</span>
              <div v-if="r.description" class="rel-description">{{ r.description }}</div>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:12px">
            Pour modifier les relations, va dans l'onglet "Relations".
          </p>
        </div>

        <!-- Onglet Inspirations -->
        <div v-show="currentTab === 'images'" class="tab-content active" style="display:flex">
          <p class="hint">Ajoute jusqu'à 4 images d'inspiration pour ce personnage.</p>
          <div class="inspiration-grid">
            <div
              v-for="img in images"
              :key="img.id"
              class="inspiration-slot"
            >
              <img :src="img.dataUrl" class="inspiration-img" alt="Inspiration">
              <button class="inspiration-delete" @click="deleteImage(img)" title="Supprimer">×</button>
            </div>
            <button
              v-if="images.length < 4"
              class="inspiration-add"
              @click="pickImage"
              title="Ajouter une image"
            >
              <span>+</span>
              <small>Ajouter</small>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Modal nouveau personnage -->
  <div v-if="showModal" class="modal-overlay">
    <div class="modal">
      <h2>Nouveau personnage</h2>
      <label>Nom <input v-model="modalName" type="text" placeholder="Ex: Hadrianè" @keydown.enter="createCharacter" @keydown.escape="showModal = false"></label>
      <label>Origine
        <input
          v-model="modalOrigin"
          type="text"
          list="origins-datalist"
          placeholder="Ex: Noble, Paysan, Elfe..."
        >
      </label>
      <label>Rôle
        <select v-model="modalRole">
          <option value="protagoniste">Protagoniste</option>
          <option value="antagoniste">Antagoniste</option>
          <option value="secondaire">Secondaire</option>
        </select>
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" @click="showModal = false">Annuler</button>
        <button class="btn-primary" @click="createCharacter">Créer</button>
      </div>
    </div>
  </div>
</template>

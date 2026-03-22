<script setup>
import { ref, watch, inject, onMounted } from 'vue'

const props = defineProps({ projectId: Number, characters: Array })
const confirm = inject('confirm')

const relations = ref([])
const relA = ref('')
const relB = ref('')
const relType = ref('ami')
const relDesc = ref('')
const errorMsg = ref('')

async function load() {
  if (!props.projectId) { relations.value = []; return }
  relations.value = await window.api.relationships.getAll(props.projectId)
  if (props.characters?.length) {
    relA.value = props.characters[0]?.id || ''
    relB.value = props.characters[1]?.id || props.characters[0]?.id || ''
  }
}

async function addRelation() {
  const aId = parseInt(relA.value)
  const bId = parseInt(relB.value)
  if (aId === bId) {
    errorMsg.value = 'Choisis 2 personnages différents'
    setTimeout(() => errorMsg.value = '', 2000)
    return
  }
  await window.api.relationships.save({
    project_id: props.projectId,
    character_a_id: aId,
    character_b_id: bId,
    relation_type: relType.value,
    description: relDesc.value,
  })
  relDesc.value = ''
  await load()
}

async function deleteRelation(id) {
  const ok = await confirm('Supprimer cette relation ?')
  if (!ok) return
  await window.api.relationships.delete(id)
  await load()
}

watch(() => props.projectId, load)
onMounted(load)
</script>

<template>
  <div class="view-inner">
    <h2>Relations entre personnages</h2>

    <div v-if="relations.length === 0" style="color:var(--text-muted);margin-bottom:24px">
      Aucune relation pour l'instant.
    </div>
    <div v-else id="relationships-list">
      <div v-for="r in relations" :key="r.id" class="relationship-card">
        <div class="rel-names">
          {{ r.character_a_name }} ↔ {{ r.character_b_name }}
          <span class="rel-type-badge">{{ r.relation_type }}</span>
          <div class="rel-description">{{ r.description }}</div>
        </div>
        <button class="btn-danger btn-remove-rel" @click="deleteRelation(r.id)">Supprimer</button>
      </div>
    </div>

    <div class="relationship-add">
      <h3>Ajouter une relation</h3>
      <div class="form-grid">
        <label>Personnage A
          <select v-model="relA">
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>Personnage B
          <select v-model="relB">
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>Type de relation
          <select v-model="relType">
            <option value="ami">Ami(e)</option>
            <option value="ennemi">Ennemi(e)</option>
            <option value="amour">Amour</option>
            <option value="famille">Famille</option>
            <option value="mentor">Mentor / Élève</option>
            <option value="allie">Allié(e)</option>
            <option value="rival">Rival(e)</option>
            <option value="autre">Autre</option>
          </select>
        </label>
      </div>
      <label class="full-width">Description
        <textarea v-model="relDesc" rows="2" placeholder="Décris la nature de la relation..."></textarea>
      </label>
      <p v-if="errorMsg" style="color:var(--warning)">{{ errorMsg }}</p>
      <button class="btn-primary" @click="addRelation">Ajouter la relation</button>
    </div>
  </div>
</template>

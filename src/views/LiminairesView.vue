<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'

const props = defineProps({ projectId: Number })

const TYPES = [
  { type: 'copyright',      label: 'Copyright & ISBN',           desc: 'Éditeur, ISBN, droits, propriété intellectuelle' },
  { type: 'auteur',         label: 'À propos de l\'auteur',      desc: 'Biographie courte de l\'auteur' },
  { type: 'dedicace',       label: 'Dédicace',                   desc: 'Dédicace personnelle' },
  { type: 'epigraphe',      label: 'Épigraphe',                  desc: 'Citation en ouverture' },
  { type: 'preface',        label: 'Préface',                    desc: 'Écrite par un tiers' },
  { type: 'avant-propos',   label: 'Avant-propos',               desc: 'Mot de l\'auteur avant l\'œuvre' },
  { type: 'postface',       label: 'Postface',                   desc: 'Mot de l\'auteur après l\'œuvre' },
  { type: 'remerciements',  label: 'Remerciements',              desc: 'Personnes à remercier' },
  { type: 'composition',    label: 'Composition & mise en page', desc: 'Crédits techniques' },
]

const current = ref(null)   // { type, label, desc }
const saveStatus = ref('')
let saveTimer = null

const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    TextStyle,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ],
  content: '',
  editorProps: { attributes: { class: 'lim-editor' } },
  onUpdate: ({ editor }) => {
    clearTimeout(saveTimer)
    saveStatus.value = 'saving'
    saveTimer = setTimeout(() => autoSave(editor), 1500)
  },
})

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

async function autoSave(ed) {
  if (!current.value || !props.projectId) return
  const content = ed.getHTML()
  const word_count = countWords(ed.getText())
  await window.api.liminaires.save(props.projectId, current.value.type, { content, word_count })
  saveStatus.value = 'saved'
  setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = '' }, 2000)
}

async function openType(item) {
  if (current.value?.type === item.type) return
  // Sauvegarder l'actuel avant de changer
  if (current.value && editor.value) {
    clearTimeout(saveTimer)
    await autoSave(editor.value)
  }
  current.value = item
  const record = await window.api.liminaires.get(props.projectId, item.type)
  editor.value?.commands.setContent(record?.content || '')
  editor.value?.commands.focus()
}

watch(() => props.projectId, () => {
  current.value = null
  editor.value?.commands.setContent('')
})

onBeforeUnmount(async () => {
  clearTimeout(saveTimer)
  if (current.value && editor.value) await autoSave(editor.value)
})
</script>

<template>
  <div class="view-inner view-characters-inner">

    <!-- Panneau gauche -->
    <div class="lim-list-panel">
      <h2 class="lim-panel-title">Liminaires & Annexes</h2>
      <div class="lim-list">
        <div
          v-for="item in TYPES"
          :key="item.type"
          class="lim-item"
          :class="{ active: current?.type === item.type }"
          @click="openType(item)"
        >
          <div class="lim-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="lim-item-text">
            <span class="lim-item-label">{{ item.label }}</span>
            <span class="lim-item-desc">{{ item.desc }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Panneau droit : éditeur -->
    <div class="char-detail-panel lim-editor-panel">

      <div v-if="!current" class="char-detail-empty">
        <p>Sélectionne une section dans la liste</p>
      </div>

      <template v-else>
        <!-- En-tête -->
        <div class="lim-header">
          <div>
            <h2 class="lim-title">{{ current.label }}</h2>
            <p class="lim-subtitle">{{ current.desc }}</p>
          </div>
          <span class="save-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Enregistré' : '' }}
          </span>
        </div>

        <!-- Toolbar -->
        <div class="lim-toolbar" v-if="editor">
          <div class="toolbar-group">
            <button class="toolbar-btn" :class="{ active: editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()"><b>G</b></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('underline') }" @click="editor.chain().focus().toggleUnderline().run()"><u>S</u></button>
          </div>
          <div class="toolbar-sep"></div>
          <div class="toolbar-group">
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'left' }) }" @click="editor.chain().focus().setTextAlign('left').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="3" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="3" y="19" width="10" height="2" rx="1"/></svg></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'center' }) }" @click="editor.chain().focus().setTextAlign('center').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="6" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="7" y="19" width="10" height="2" rx="1"/></svg></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'right' }) }" @click="editor.chain().focus().setTextAlign('right').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="9" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="11" y="19" width="10" height="2" rx="1"/></svg></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'justify' }) }" @click="editor.chain().focus().setTextAlign('justify').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="3" y="9" width="18" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg></button>
          </div>
          <div class="toolbar-sep"></div>
          <div class="toolbar-group">
            <button v-for="level in [1,2,3]" :key="level"
              class="toolbar-btn"
              :class="{ active: editor.isActive('heading', { level }) }"
              @click="editor.chain().focus().toggleHeading({ level }).run()"
            >H{{ level }}</button>
          </div>
        </div>

        <!-- Zone d'écriture -->
        <div class="lim-page-wrapper">
          <div class="lim-page">
            <EditorContent :editor="editor" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ---- Panneau gauche ---- */
.lim-list-panel {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lim-panel-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-accent);
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--color-border);
  margin: 0;
}

.lim-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.lim-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s;
}
.lim-item:hover { background: var(--color-card); }
.lim-item.active {
  background: var(--color-card);
  border-left-color: var(--color-accent);
}

.lim-item-icon {
  font-size: 18px;
  margin-top: 1px;
  flex-shrink: 0;
}

.lim-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lim-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-tx);
}

.lim-item-desc {
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.4;
}

/* ---- Panneau droit ---- */
.lim-editor-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.lim-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-sidebar);
  flex-shrink: 0;
}

.lim-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-tx);
  margin: 0 0 2px;
}

.lim-subtitle {
  font-size: 12px;
  color: var(--color-muted);
  margin: 0;
}

.save-status {
  font-size: 12px;
  color: var(--color-muted);
  min-width: 90px;
  text-align: right;
}
.save-status.saved { color: var(--color-success, #6fcf97); }

/* ---- Toolbar ---- */
.lim-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--color-sidebar);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toolbar-group { display: flex; gap: 2px; }
.toolbar-sep { width: 1px; height: 22px; background: var(--color-border); margin: 0 4px; }

.toolbar-btn {
  padding: 4px 8px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  min-width: 28px;
  transition: all 0.15s;
}
.toolbar-btn:hover { background: var(--color-card); color: var(--color-tx); }
.toolbar-btn.active { background: var(--color-accent); color: white; }

/* ---- Page ---- */
.lim-page-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px;
  background: var(--color-bg);
}

.lim-page {
  max-width: 680px;
  margin: 0 auto;
  background: var(--color-card);
  border-radius: 8px;
  padding: 48px 56px;
  min-height: calc(100vh - 200px);
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
}

/* ---- Éditeur ---- */
:deep(.lim-editor) {
  outline: none;
  min-height: 300px;
  line-height: 1.9;
  font-size: 15px;
  color: var(--color-tx);
}
:deep(.lim-editor p) { margin: 0 0 12px; }
:deep(.lim-editor h1) { font-size: 24px; font-weight: 700; margin: 0 0 16px; }
:deep(.lim-editor h2) { font-size: 19px; font-weight: 600; margin: 0 0 12px; }
:deep(.lim-editor h3) { font-size: 15px; font-weight: 600; margin: 0 0 10px; color: var(--color-muted); }
:deep(.lim-editor strong) { font-weight: 700; }
:deep(.lim-editor em) { font-style: italic; }
:deep(.lim-editor u) { text-decoration: underline; }
</style>

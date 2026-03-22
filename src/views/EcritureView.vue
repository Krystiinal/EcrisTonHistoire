<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Node, Extension } from '@tiptap/core'
import { TextSelection } from 'prosemirror-state'
import StarterKit from '@tiptap/starter-kit'

// ---- Extension Bloc personnalisé ----
const TextBlock = Node.create({
  name: 'textBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      marginLeft:  { default: 60 },
      marginRight: { default: 60 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="text-block"]' }]
  },

  renderHTML({ node }) {
    return ['div', {
      'data-type': 'text-block',
      style: `margin-left:${node.attrs.marginLeft}px; margin-right:${node.attrs.marginRight}px;`,
    }, 0]
  },
})
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'

// Extension taille de police (basée sur TextStyle)
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }]
  },
  addCommands() {
    return {
      setFontSize: size => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: size ? `${size}px` : null }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})
import TextAlign from '@tiptap/extension-text-align'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'

const props = defineProps({ projectId: Number })
const confirm = inject('confirm')
const registerForceSave = inject('registerForceSave')
const setSaveStatus = inject('setSaveStatus')

// ---- Chapitres ----
const chapters = ref([])
const currentChapter = ref(null)
const chapterTitle = ref('')
const saveStatus = ref('') // '', 'saving', 'saved'
let saveTimer = null

// ---- Statuts de chapitre ----
const CHAPTER_STATUSES = [
  { value: null,        icon: '○', label: 'Aucun',    color: 'var(--text-muted)' },
  { value: 'en_cours',  icon: '✏', label: 'En cours', color: '#4a9eff' },
  { value: 'a_revoir',  icon: '⚑', label: 'À revoir', color: '#ff9800' },
  { value: 'a_relire',  icon: '◎', label: 'À relire', color: '#b07fff' },
  { value: 'termine',   icon: '✓', label: 'Terminé',  color: '#4caf50' },
]

const statusPickerOpenId  = ref(null)
const statusPickerChapter = ref(null)
const statusPickerPos     = ref({ top: 0, bottom: 0, left: 0 })
const statusPickerUp      = ref(false)

const pickerStyle = computed(() => ({
  position: 'fixed',
  left: statusPickerPos.value.left + 'px',
  ...(statusPickerUp.value
    ? { bottom: (window.innerHeight - statusPickerPos.value.top) + 'px', top: 'auto' }
    : { top: statusPickerPos.value.bottom + 4 + 'px', bottom: 'auto' }
  ),
}))

function statusFor(value) {
  return CHAPTER_STATUSES.find(s => s.value === value) || CHAPTER_STATUSES[0]
}

async function setChapterStatus(ch, value) {
  if (!ch) return
  statusPickerOpenId.value = null
  await window.api.chapters.update(ch.id, { status: value })
  // Mettre à jour dans le tableau reactif pour que l'icône se rafraîchisse
  const idx = chapters.value.findIndex(c => c.id === ch.id)
  if (idx !== -1) chapters.value[idx].status = value
}

function toggleStatusPicker(e, ch) {
  e.stopPropagation()
  if (statusPickerOpenId.value === ch.id) {
    statusPickerOpenId.value = null
    return
  }
  const rect = e.currentTarget.getBoundingClientRect()
  statusPickerUp.value   = window.innerHeight - rect.bottom < 160
  statusPickerPos.value  = { top: rect.top, bottom: rect.bottom, left: rect.left }
  statusPickerChapter.value = ch
  statusPickerOpenId.value  = ch.id
}

// Fermer le picker au clic extérieur
function onDocClick() { statusPickerOpenId.value = null }

// Modal nouveau chapitre / partie
const showChapterModal = ref(false)
const modalTitle = ref('')
const modalPart = ref('')

const existingParts = computed(() =>
  [...new Set(chapters.value.map(c => c.part).filter(Boolean))]
)

// ---- Recherche ----
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const searchLoading = ref(false)

let searchTimer = null
watch(searchQuery, (q) => {
  clearTimeout(searchTimer)
  if (!q.trim() || q.trim().length < 2) { searchResults.value = []; return }
  searchLoading.value = true
  searchTimer = setTimeout(async () => {
    searchResults.value = await window.api.chapters.search(props.projectId, q.trim())
    searchLoading.value = false
  }, 350)
})

function openSearchResult(chapterId) {
  const ch = chapters.value.find(c => c.id === chapterId)
  if (ch) { openChapter(ch); showSearch.value = false; searchQuery.value = '' }
}

// ---- Groupement par parties ----
const grouped = computed(() => {
  const parts = {}
  const noPart = []
  for (const ch of chapters.value) {
    if (ch.part) {
      if (!parts[ch.part]) parts[ch.part] = []
      parts[ch.part].push(ch)
    } else {
      noPart.push(ch)
    }
  }
  const result = []
  if (noPart.length) result.push({ part: null, items: noPart })
  for (const [part, items] of Object.entries(parts)) {
    result.push({ part, items })
  }
  return result
})

// ---- Total mots ----
const totalWords = computed(() =>
  chapters.value.reduce((sum, ch) => sum + (ch.word_count || 0), 0)
)

// ---- Éditeur TipTap ----
const FONTS = [
  { label: 'Par défaut', value: '' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Garamond', value: 'Garamond, "Book Antiqua", Palatino, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Palatino', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
]

const currentFont = ref('')
const showFontDropdown = ref(false)
const currentFontSize = ref('')

const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

function applyFontSize(size) {
  currentFontSize.value = size ? String(size) : ''
  if (!editor.value) return
  if (!size) editor.value.chain().focus().unsetFontSize().run()
  else editor.value.chain().focus().setFontSize(size).run()
}


// ---- Réglages typographiques ----
const showParaSettings = ref(false)
const indentSize  = ref(0)   // em
const spaceBefore = ref(0)   // px
const spaceAfter  = ref(12)  // px

// ---- Zoom éditeur ----
const zoomLevel = ref(100)
const editorWrapperRef = ref(null)

function zoomKey() { return `editor_zoom_${props.projectId}` }
function loadZoom() { zoomLevel.value = parseInt(localStorage.getItem(zoomKey()) || '100') }
function setZoom(v) { zoomLevel.value = Math.min(200, Math.max(60, v)); localStorage.setItem(zoomKey(), zoomLevel.value) }

function onWheelZoom(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  e.stopPropagation()
  setZoom(zoomLevel.value + (e.deltaY < 0 ? 10 : -10))
}

// ---- Estimation du nombre de pages ----
const PAGE_FORMATS = [
  { id: 'roman',  label: 'Roman (135×210)',  w: 135, h: 210 },
  { id: 'poche',  label: 'Poche (108×177)',  w: 108, h: 177 },
  { id: 'a5',     label: 'A5 (148×210)',     w: 148, h: 210 },
  { id: 'a4',     label: 'A4 (210×297)',     w: 210, h: 297 },
  { id: 'custom', label: 'Personnalisé',     w: null, h: null },
]

const pageEst = ref({
  formatId:    'roman',
  pageW:       135,   // mm
  pageH:       210,
  marginT:     20,    // mm
  marginB:     20,
  marginL:     20,
  marginR:     20,
  fontSize:    11,    // pt
  lineSpacing: 1.4,
})
const showPageEst = ref(false)

// Mots par page estimés selon le format
const wordsPerPage = computed(() => {
  const s = pageEst.value
  const contentW = s.pageW - s.marginL - s.marginR   // mm
  const contentH = s.pageH - s.marginT - s.marginB
  const PT_PER_MM = 2.835
  const charsPerLine  = (contentW * PT_PER_MM) / (s.fontSize * 0.55)
  const linesPerPage  = (contentH * PT_PER_MM) / (s.fontSize * s.lineSpacing)
  return Math.max(1, Math.round((charsPerLine / 5.5) * linesPerPage))
})

const totalEstPages = computed(() =>
  Math.max(1, Math.ceil(totalWords.value / wordsPerPage.value))
)

function estPages(wordCount) {
  return Math.max(1, Math.ceil((wordCount || 0) / wordsPerPage.value))
}

function applyFormat(fmt) {
  pageEst.value.formatId = fmt.id
  if (fmt.w) { pageEst.value.pageW = fmt.w; pageEst.value.pageH = fmt.h }
}

const PAGE_EST_KEY = 'page_est_settings'
function loadPageEst() {
  try {
    const s = JSON.parse(localStorage.getItem(PAGE_EST_KEY) || '{}')
    if (s.formatId) Object.assign(pageEst.value, s)
  } catch {}
}
function savePageEst() {
  localStorage.setItem(PAGE_EST_KEY, JSON.stringify(pageEst.value))
}
watch(pageEst, savePageEst, { deep: true })

function paraSettingsKey() { return `para_settings_${props.projectId}` }

function loadParaSettings() {
  const saved = localStorage.getItem(paraSettingsKey())
  if (saved) {
    const s = JSON.parse(saved)
    indentSize.value  = s.indentSize  ?? 0
    spaceBefore.value = s.spaceBefore ?? 0
    spaceAfter.value  = s.spaceAfter  ?? 12
  } else {
    indentSize.value = 0; spaceBefore.value = 0; spaceAfter.value = 12
  }
}

function saveParaSettings() {
  localStorage.setItem(paraSettingsKey(), JSON.stringify({
    indentSize: indentSize.value,
    spaceBefore: spaceBefore.value,
    spaceAfter: spaceAfter.value,
  }))
}

watch([indentSize, spaceBefore, spaceAfter], saveParaSettings)

// ---- Bloc personnalisé ----
const inTextBlock = computed(() => editor.value?.isActive('textBlock') ?? false)
const textBlockAttrs = computed(() => editor.value?.getAttributes('textBlock') ?? { marginLeft: 60, marginRight: 60 })

function toggleTextBlock() {
  if (!editor.value) return
  if (inTextBlock.value) {
    editor.value.chain().focus().lift('textBlock').run()
  } else {
    editor.value.chain().focus().wrapIn('textBlock').run()
  }
}

function updateTextBlock(attr, value) {
  editor.value?.chain().focus().updateAttributes('textBlock', { [attr]: value }).run()
}

const currentFontLabel = computed(() => {
  const found = allFonts.value.find(f => f.value === currentFont.value)
  return found ? found.label : 'Par défaut'
})

// ---- Polices personnalisées ----
const customFonts = ref([])
const showFontManager = ref(false)

function injectFontFace(font) {
  if (!font.dataUrl) return
  if (document.querySelector(`style[data-font-id="${font.id}"]`)) return
  const style = document.createElement('style')
  style.setAttribute('data-font-id', font.id)
  style.textContent = `@font-face { font-family: "${font.name}"; src: url("${font.dataUrl}"); }`
  document.head.appendChild(style)
}

async function loadCustomFonts() {
  customFonts.value = await window.api.customFonts.getAll()
  customFonts.value.forEach(injectFontFace)
}

async function importFont() {
  const font = await window.api.customFonts.pick()
  if (!font) return
  customFonts.value.push(font)
  injectFontFace(font)
}

async function removeFont(font) {
  await window.api.customFonts.delete(font.id)
  customFonts.value = customFonts.value.filter(f => f.id !== font.id)
  document.querySelector(`style[data-font-id="${font.id}"]`)?.remove()
}

const allFonts = computed(() => [
  ...FONTS,
  ...customFonts.value.map(f => ({ label: f.name, value: `"${f.name}"` }))
])

const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    TextStyle,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CharacterCount,
    Highlight.configure({ multicolor: false }),
    TextBlock,
  ],
  content: '',
  editorProps: {
    attributes: { class: 'prose-editor' },
  },
  onUpdate: ({ editor }) => {
    clearTimeout(saveTimer)
    saveStatus.value = 'saving'
    setSaveStatus?.('saving', null)
    saveTimer = setTimeout(() => autoSave(editor), 1500)
    const attrs = editor.getAttributes('textStyle')
    currentFont.value = attrs.fontFamily || ''
    currentFontSize.value = attrs.fontSize ? attrs.fontSize.replace('px', '') : ''
  },
  onSelectionUpdate: ({ editor }) => {
    const attrs = editor.getAttributes('textStyle')
    currentFont.value = attrs.fontFamily || ''
    currentFontSize.value = attrs.fontSize ? attrs.fontSize.replace('px', '') : ''
  },
})

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

async function autoSave(ed) {
  if (!currentChapter.value) return
  const content = ed.getHTML()
  const words = countWords(ed.getText())
  await window.api.chapters.update(currentChapter.value.id, { content, word_count: words })
  currentChapter.value.word_count = words
  const idx = chapters.value.findIndex(c => c.id === currentChapter.value.id)
  if (idx !== -1) chapters.value[idx].word_count = words
  saveStatus.value = 'saved'
  setSaveStatus?.('saved', new Date())
  setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = '' }, 2000)
}

// ---- Charger les chapitres ----
async function loadChapters() {
  if (!props.projectId) { chapters.value = []; return }
  chapters.value = await window.api.chapters.getAll(props.projectId)
}

async function openChapter(ch) {
  // Sauvegarder l'actuel avant de changer
  if (currentChapter.value && editor.value) {
    clearTimeout(saveTimer)
    await autoSave(editor.value)
  }
  const full = await window.api.chapters.get(ch.id)
  currentChapter.value = full
  chapterTitle.value = full.title
  editor.value?.commands.setContent(full.content || '')
  editor.value?.commands.focus()
}

async function saveTitle() {
  if (!currentChapter.value) return
  const title = chapterTitle.value.trim() || 'Sans titre'
  await window.api.chapters.update(currentChapter.value.id, { title })
  currentChapter.value.title = title
  const idx = chapters.value.findIndex(c => c.id === currentChapter.value.id)
  if (idx !== -1) chapters.value[idx].title = title
}

async function createChapter() {
  if (!props.projectId) return
  const title = modalTitle.value.trim() || 'Nouveau chapitre'
  const part = modalPart.value.trim() || null
  showChapterModal.value = false
  const ch = await window.api.chapters.create({ project_id: props.projectId, title, part })
  await loadChapters()
  await openChapter(ch)
  nextTick(() => {
    document.querySelector('.chapter-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

async function deleteChapter(ch) {
  const ok = await confirm(`Supprimer "${ch.title}" ? Le contenu sera perdu définitivement.`)
  if (!ok) return
  await window.api.chapters.delete(ch.id)
  if (currentChapter.value?.id === ch.id) {
    currentChapter.value = null
    editor.value?.commands.setContent('')
  }
  await loadChapters()
}

// ---- Export Word ----
const exporting = ref(false)

async function exportWord() {
  if (!props.projectId || exporting.value) return
  // Sauvegarder le chapitre en cours avant l'export
  if (currentChapter.value && editor.value) {
    clearTimeout(saveTimer)
    await autoSave(editor.value)
  }
  exporting.value = true
  try {
    await window.api.export.word(props.projectId)
  } finally {
    exporting.value = false
  }
}

// ---- Transformation de casse ----
function transformCase(type) {
  if (!editor.value) return
  const { state, view } = editor.value
  const { from, to, empty } = state.selection
  if (empty) return
  const tr = state.tr
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const start = Math.max(from, pos)
    const end   = Math.min(to, pos + node.nodeSize)
    const slice = node.text.slice(start - pos, end - pos)
    let result
    if      (type === 'upper')      result = slice.toUpperCase()
    else if (type === 'lower')      result = slice.toLowerCase()
    else if (type === 'capitalize') result = slice.replace(/(^\s*\S|(?<=[.!?]\s+)\S)/g, c => c.toUpperCase())
    else if (type === 'title')      result = slice.replace(/\b\w/g, c => c.toUpperCase())
    tr.insertText(result, start, end)
  })
  // Restaurer la sélection (les positions ne changent pas car la casse ne modifie pas la longueur)
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from), tr.mapping.map(to)))
  view.dispatch(tr)
}

// ---- Toolbar ----
function applyFont(font) {
  currentFont.value = font
  if (!font) {
    editor.value?.chain().focus().unsetFontFamily().run()
  } else {
    editor.value?.chain().focus().setFontFamily(font).run()
  }
}

// ---- Watchers ----
watch(() => props.projectId, async () => {
  currentChapter.value = null
  editor.value?.commands.setContent('')
  loadZoom()
  loadParaSettings()
  await loadChapters()
}, { immediate: true })

async function forceSaveNow() {
  if (currentChapter.value && editor.value) {
    clearTimeout(saveTimer)
    await autoSave(editor.value)
  }
}

function onCtrlS(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    forceSaveNow()
  }
}

onMounted(() => {
  loadCustomFonts()
  loadPageEst()
  registerForceSave(forceSaveNow)
  window.addEventListener('keydown', onCtrlS)
  document.addEventListener('click', onDocClick)
})

watch(editorWrapperRef, (el, oldEl) => {
  oldEl?.removeEventListener('wheel', onWheelZoom)
  el?.addEventListener('wheel', onWheelZoom, { passive: false })
})

onBeforeUnmount(async () => {
  registerForceSave(null)
  setSaveStatus?.('', null)
  window.removeEventListener('keydown', onCtrlS)
  document.removeEventListener('click', onDocClick)
  editorWrapperRef.value?.removeEventListener('wheel', onWheelZoom)
  clearTimeout(saveTimer)
  if (currentChapter.value && editor.value) {
    await autoSave(editor.value)
  }
})
</script>

<template>
  <div class="view-inner view-characters-inner">

    <!-- ===== Panneau gauche : liste des chapitres ===== -->
    <div class="char-list-panel ecriture-list-panel">

      <!-- Barre d'actions -->
      <div class="chapter-panel-actions">
        <button class="btn-primary chapter-add-btn" @click="modalTitle = ''; modalPart = ''; showChapterModal = true">
          + Chapitre
        </button>
        <button
          class="chapter-search-toggle"
          :class="{ active: showSearch }"
          title="Rechercher dans tous les chapitres"
          @click="showSearch = !showSearch; searchQuery = ''; searchResults = []"
        >⌕</button>
        <button
          class="chapter-export-btn"
          :disabled="!chapters.length || exporting"
          title="Exporter tous les chapitres en Word (.docx)"
          @click="exportWord"
        >{{ exporting ? '…' : '⤓' }}</button>
      </div>

      <!-- Mode recherche -->
      <template v-if="showSearch">
        <div class="search-input-wrap">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="Nom, lieu, mot-clé..."
            autofocus
          >
          <span v-if="searchLoading" class="search-spinner">…</span>
        </div>

        <div class="search-results">
          <p v-if="searchQuery.length >= 2 && !searchLoading && searchResults.length === 0" class="search-empty">
            Aucun résultat pour "{{ searchQuery }}"
          </p>
          <div v-for="r in searchResults" :key="r.id" class="search-result-item" @click="openSearchResult(r.id)">
            <div class="search-result-header">
              <span class="search-result-title">{{ r.title }}</span>
              <span class="search-result-count">{{ r.count }}×</span>
            </div>
            <p v-if="r.part" class="search-result-part">{{ r.part }}</p>
            <p
              v-for="(snippet, i) in r.occurrences"
              :key="i"
              class="search-result-snippet"
              v-html="snippet.replace(new RegExp(searchQuery, 'gi'), m => `<mark>${m}</mark>`)"
            ></p>
          </div>
        </div>
      </template>

      <!-- Mode liste normale -->
      <template v-else>
        <div class="ecriture-stats">
          <span>{{ chapters.length }} chapitre{{ chapters.length > 1 ? 's' : '' }}</span>
          <span>{{ totalWords.toLocaleString() }} mots</span>
          <button
            class="page-est-btn"
            :class="{ active: showPageEst }"
            title="Estimation du nombre de pages"
            @click.stop="showPageEst = !showPageEst"
          >~{{ totalEstPages }} p.</button>
        </div>

        <!-- Panneau d'estimation des pages -->
        <div v-if="showPageEst" class="page-est-panel" @click.stop>
          <p class="page-est-title">Estimation — format de publication</p>
          <div class="page-est-formats">
            <button
              v-for="fmt in PAGE_FORMATS"
              :key="fmt.id"
              class="fmt-btn"
              :class="{ active: pageEst.formatId === fmt.id }"
              @click="applyFormat(fmt)"
            >{{ fmt.label }}</button>
          </div>
          <div v-if="pageEst.formatId === 'custom'" class="page-est-row">
            <span>Format (mm)</span>
            <div class="page-est-dims">
              <input type="number" v-model.number="pageEst.pageW" min="50" max="400" class="est-input" title="Largeur">
              <span>×</span>
              <input type="number" v-model.number="pageEst.pageH" min="50" max="600" class="est-input" title="Hauteur">
            </div>
          </div>
          <div class="page-est-row">
            <span>Marges (mm)</span>
            <div class="page-est-margins">
              <label>H<input type="number" v-model.number="pageEst.marginT" min="0" max="60" class="est-input-sm"></label>
              <label>B<input type="number" v-model.number="pageEst.marginB" min="0" max="60" class="est-input-sm"></label>
              <label>G<input type="number" v-model.number="pageEst.marginL" min="0" max="60" class="est-input-sm"></label>
              <label>D<input type="number" v-model.number="pageEst.marginR" min="0" max="60" class="est-input-sm"></label>
            </div>
          </div>
          <div class="page-est-row">
            <span>Corps (pt)</span>
            <input type="number" v-model.number="pageEst.fontSize" min="6" max="24" class="est-input">
          </div>
          <div class="page-est-row">
            <span>Interligne</span>
            <input type="number" v-model.number="pageEst.lineSpacing" min="1" max="3" step="0.1" class="est-input">
          </div>
          <div class="page-est-result">
            <span>≈ {{ wordsPerPage }} mots/page</span>
            <strong>{{ totalEstPages }} pages au total</strong>
          </div>
        </div>

        <div class="chapter-list">
          <template v-if="chapters.length === 0">
            <p class="chapter-empty-hint">Aucun chapitre. Crée ton premier chapitre pour commencer à écrire.</p>
          </template>
          <template v-for="group in grouped" :key="group.part ?? '__nopart__'">
            <div v-if="group.part" class="chapter-part-header">{{ group.part }}</div>
            <div
              v-for="ch in group.items"
              :key="ch.id"
              class="chapter-item"
              :class="{ active: currentChapter?.id === ch.id }"
              @click="openChapter(ch)"
            >
              <!-- Statut -->
              <div class="chapter-status-wrap" @click.stop>
                <button
                  class="chapter-status-btn"
                  :title="statusFor(ch.status).label"
                  :style="{ color: statusFor(ch.status).color }"
                  @click="toggleStatusPicker($event, ch)"
                >{{ statusFor(ch.status).icon }}</button>
              </div>

              <div class="chapter-item-info">
                <span class="chapter-item-title">{{ ch.title }}</span>
                <span class="chapter-item-words">
                  {{ (ch.word_count || 0).toLocaleString() }} mots
                  <span class="chapter-item-pages">· ~{{ estPages(ch.word_count) }} p.</span>
                </span>
              </div>
              <button
                class="chapter-item-delete"
                title="Supprimer"
                @click.stop="deleteChapter(ch)"
              >×</button>
            </div>
          </template>
        </div>
      </template>

    </div>

    <!-- ===== Panneau droit : éditeur ===== -->
    <div class="char-detail-panel ecriture-editor-panel">

      <!-- État vide -->
      <div v-if="!currentChapter" class="char-detail-empty">
        <p>Sélectionne un chapitre ou crée-en un nouveau</p>
      </div>

      <template v-else>
        <!-- Titre du chapitre -->
        <div class="chapter-title-bar">
          <input
            v-model="chapterTitle"
            class="chapter-title-input"
            placeholder="Titre du chapitre"
            @blur="saveTitle"
            @keydown.enter.prevent="saveTitle"
          >
          <button
            class="chapter-save-btn"
            :class="saveStatus || 'idle'"
            :title="saveStatus === 'saving' ? 'Sauvegarde en cours…' : saveStatus === 'saved' ? 'Sauvegardé' : 'Sauvegarder (Ctrl+S)'"
            @click="forceSaveNow"
          >
            <span v-if="saveStatus === 'saving'" class="csb-icon csb-spin">⟳</span>
            <span v-else-if="saveStatus === 'saved'" class="csb-icon">✓</span>
            <span v-else class="csb-icon">💾</span>
            <span class="csb-label">
              {{ saveStatus === 'saving' ? 'Sauvegarde…' : saveStatus === 'saved' ? 'Sauvegardé' : 'Sauvegarder' }}
            </span>
          </button>
          <span class="editor-word-count">{{ (currentChapter.word_count || 0).toLocaleString() }} mots</span>
          <div class="zoom-controls">
            <button class="zoom-btn" @click="setZoom(zoomLevel - 10)" :disabled="zoomLevel <= 60" title="Réduire">−</button>
            <span class="zoom-level" @click="setZoom(100)" title="Réinitialiser (100%)">{{ zoomLevel }}%</span>
            <button class="zoom-btn" @click="setZoom(zoomLevel + 10)" :disabled="zoomLevel >= 200" title="Agrandir">+</button>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="editor-toolbar" v-if="editor">
          <!-- Paragraphe / Titres -->
          <div class="toolbar-group">
            <button
              class="toolbar-btn"
              :class="{ active: editor.isActive('paragraph') && !editor.isActive('heading') }"
              title="Paragraphe"
              @click="editor.chain().focus().setParagraph().run()"
            >¶</button>
            <button
              v-for="level in [1, 2, 3]" :key="level"
              class="toolbar-btn"
              :class="{ active: editor.isActive('heading', { level }) }"
              :title="`Titre ${level}`"
              @click="editor.chain().focus().toggleHeading({ level }).run()"
            >H{{ level }}</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Formatage -->
          <div class="toolbar-group">
            <button class="toolbar-btn" :class="{ active: editor.isActive('bold') }" title="Gras" @click="editor.chain().focus().toggleBold().run()"><b>G</b></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('italic') }" title="Italique" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('underline') }" title="Souligné" @click="editor.chain().focus().toggleUnderline().run()"><u>S</u></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('strike') }" title="Barré" @click="editor.chain().focus().toggleStrike().run()"><s>B</s></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('highlight') }" title="Surligner" @click="editor.chain().focus().toggleHighlight().run()">⬛</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Casse -->
          <div class="toolbar-group">
            <button class="toolbar-btn case-btn" title="MAJUSCULES (sélection)" @click="transformCase('upper')">AA</button>
            <button class="toolbar-btn case-btn" title="minuscules (sélection)" @click="transformCase('lower')">aa</button>
            <button class="toolbar-btn case-btn" title="Première lettre de chaque phrase" @click="transformCase('capitalize')">Aa</button>
            <button class="toolbar-btn case-btn" title="Chaque Mot En Majuscule" @click="transformCase('title')">Ab</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Alignement -->
          <div class="toolbar-group">
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'left' }) }" title="Gauche" @click="editor.chain().focus().setTextAlign('left').run()">≡</button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'center' }) }" title="Centrer" @click="editor.chain().focus().setTextAlign('center').run()">≡</button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'right' }) }" title="Droite" @click="editor.chain().focus().setTextAlign('right').run()">≡</button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'justify' }) }" title="Justifier" @click="editor.chain().focus().setTextAlign('justify').run()">≡</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Réglages paragraphe -->
          <div class="toolbar-group" style="position:relative">
            <button
              class="toolbar-btn"
              :class="{ active: showParaSettings }"
              title="Réglages de paragraphe"
              @click.stop="showParaSettings = !showParaSettings; showFontDropdown = false"
            >¶</button>
            <div v-if="showParaSettings" class="para-settings-popover" @click.stop>
              <p class="para-settings-title">Réglages de paragraphe</p>
              <label class="para-setting-row">
                <span>Retrait 1ère ligne</span>
                <input type="range" v-model.number="indentSize" min="0" max="5" step="0.5">
                <span class="para-val">{{ indentSize }}em</span>
              </label>
              <label class="para-setting-row">
                <span>Espace avant</span>
                <input type="range" v-model.number="spaceBefore" min="0" max="48" step="2">
                <span class="para-val">{{ spaceBefore }}px</span>
              </label>
              <label class="para-setting-row">
                <span>Espace après</span>
                <input type="range" v-model.number="spaceAfter" min="0" max="48" step="2">
                <span class="para-val">{{ spaceAfter }}px</span>
              </label>
            </div>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Police -->
          <div class="toolbar-group">
            <div class="font-picker" :class="{ open: showFontDropdown }">
              <button
                class="font-picker-btn"
                :style="currentFont ? `font-family: ${currentFont}` : ''"
                @click.stop="showFontDropdown = !showFontDropdown"
              >
                {{ currentFontLabel }}<span class="font-picker-arrow">▾</span>
              </button>
              <div v-if="showFontDropdown" class="font-picker-list" @click.stop>
                <div
                  v-for="(f, i) in allFonts"
                  :key="i"
                  class="font-picker-item"
                  :class="{ active: currentFont === f.value }"
                  :style="f.value ? `font-family: ${f.value}` : ''"
                  @click="applyFont(f.value); showFontDropdown = false"
                >{{ f.label }}</div>
              </div>
            </div>
            <button class="toolbar-btn" title="Gérer les polices" @click="showFontManager = true; showFontDropdown = false">🖋</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Taille de police -->
          <div class="toolbar-group font-size-group">
            <button class="toolbar-btn" title="Réduire la taille" @click="applyFontSize(Math.max(6, (parseInt(currentFontSize) || 15) - 1))">−</button>
            <select
              class="font-size-select"
              :value="currentFontSize"
              @change="applyFontSize(parseInt($event.target.value) || null)"
              title="Taille de police"
            >
              <option value="">Par défaut</option>
              <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }}</option>
            </select>
            <button class="toolbar-btn" title="Augmenter la taille" @click="applyFontSize(Math.min(200, (parseInt(currentFontSize) || 15) + 1))">+</button>
          </div>

          <div class="toolbar-sep"></div>


          <div class="toolbar-sep"></div>

          <!-- Bloc personnalisé -->
          <div class="toolbar-group">
            <button
              class="toolbar-btn textblock-btn"
              :class="{ active: inTextBlock }"
              title="Insérer un bloc indenté"
              @click="toggleTextBlock"
            >❰ ❱</button>
          </div>

          <!-- Contrôles contextuels du bloc (visibles seulement quand le curseur est dedans) -->
          <template v-if="inTextBlock">
            <div class="toolbar-sep"></div>
            <div class="toolbar-group textblock-controls">
              <span class="textblock-label">Bloc :</span>
              <span class="textblock-slider-label">◀</span>
              <input
                type="range"
                :value="textBlockAttrs.marginLeft"
                min="0" max="300" step="8"
                class="textblock-slider"
                @input="e => updateTextBlock('marginLeft', +e.target.value)"
              >
              <span class="textblock-val">{{ textBlockAttrs.marginLeft }}px</span>
              <span class="textblock-slider-label">▶</span>
              <input
                type="range"
                :value="textBlockAttrs.marginRight"
                min="0" max="300" step="8"
                class="textblock-slider"
                @input="e => updateTextBlock('marginRight', +e.target.value)"
              >
              <span class="textblock-val">{{ textBlockAttrs.marginRight }}px</span>
            </div>
          </template>
        </div>

        <!-- Zone d'écriture -->
        <div ref="editorWrapperRef" class="editor-page-wrapper" @click="showFontDropdown = false; showParaSettings = false; showPageEst = false">
          <div
            class="editor-page"
            :style="{
              '--para-indent': indentSize + 'em',
              '--para-space-before': spaceBefore + 'px',
              '--para-space-after': spaceAfter + 'px',
              zoom: zoomLevel / 100,
            }"
          >
            <EditorContent :editor="editor" />
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Modal gestionnaire de polices -->
  <div v-if="showFontManager" class="modal-overlay">
    <div class="modal">
      <h2>Polices d'écriture</h2>
      <div class="font-list">
        <div v-if="customFonts.length === 0" class="font-empty">
          Aucune police importée. Importe des fichiers .ttf, .otf, .woff ou .woff2.
        </div>
        <div v-for="font in customFonts" :key="font.id" class="font-item">
          <span class="font-preview" :style="`font-family: '${font.name}'`">{{ font.name }} — Aa Bb Cc</span>
          <button class="font-delete" @click="removeFont(font)" title="Supprimer">×</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" @click="showFontManager = false">Fermer</button>
        <button class="btn-primary" @click="importFont">+ Importer une police</button>
      </div>
    </div>
  </div>

  <!-- Picker statut chapitre (téléporté au body pour éviter le clipping) -->
  <Teleport to="body">
    <div
      v-if="statusPickerOpenId !== null"
      class="status-picker"
      :style="pickerStyle"
      @click.stop
    >
      <button
        v-for="s in CHAPTER_STATUSES"
        :key="String(s.value)"
        class="status-picker-item"
        :class="{ active: statusPickerChapter?.status === s.value }"
        :style="{ color: s.color }"
        @click="setChapterStatus(statusPickerChapter, s.value)"
      >
        <span class="spi-icon">{{ s.icon }}</span>
        <span class="spi-label">{{ s.label }}</span>
      </button>
    </div>
  </Teleport>

  <!-- Modal nouveau chapitre -->
  <div v-if="showChapterModal" class="modal-overlay">
    <div class="modal">
      <h2>Nouveau chapitre</h2>
      <label>Titre
        <input v-model="modalTitle" type="text" placeholder="Chapitre 1 — L'Éveil"
          @keydown.enter="createChapter" @keydown.escape="showChapterModal = false">
      </label>
      <label>Partie (optionnel)
        <input v-model="modalPart" type="text" list="parts-datalist" placeholder="Partie I — Les Origines">
        <datalist id="parts-datalist">
          <option v-for="p in existingParts" :key="p" :value="p" />
        </datalist>
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" @click="showChapterModal = false">Annuler</button>
        <button class="btn-primary" @click="createChapter">Créer</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- Liste chapitres ---- */
.ecriture-list-panel {
  width: 240px;
}

.chapter-panel-actions {
  display: flex;
  gap: 8px;
  padding: 12px 14px 0;
}

.chapter-add-btn {
  flex: 1;
}

.chapter-search-toggle {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.chapter-search-toggle:hover,
.chapter-search-toggle.active { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,0.08); }

.chapter-export-btn {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.chapter-export-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,0.08); }
.chapter-export-btn:disabled { opacity: 0.35; cursor: default; }

/* ---- Recherche ---- */
.search-input-wrap {
  position: relative;
  padding: 10px 14px 6px;
}

.search-input {
  width: 100%;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  padding: 7px 28px 7px 10px;
  box-sizing: border-box;
}
.search-input:focus { outline: none; border-color: var(--accent); }

.search-spinner {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 16px;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 8px;
}

.search-empty {
  padding: 12px 14px;
  color: var(--text-muted);
  font-size: 12px;
}

.search-result-item {
  padding: 10px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s;
}
.search-result-item:hover { background: var(--bg-card); border-left-color: var(--accent); }

.search-result-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.search-result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.search-result-count {
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
}

.search-result-part {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 4px;
}

.search-result-snippet {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 3px 0 0;
  border-left: 2px solid var(--border);
  padding-left: 6px;
}

.search-result-snippet + .search-result-snippet {
  margin-top: 4px;
}

:deep(.search-result-snippet mark) {
  background: rgba(233, 69, 96, 0.35);
  color: var(--text);
  border-radius: 2px;
  padding: 0 1px;
}

.ecriture-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 14px 10px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.chapter-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 120px;
}

.chapter-empty-hint {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.chapter-part-header {
  padding: 10px 14px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--accent);
  font-weight: 600;
}

.chapter-status-wrap {
  position: relative;
  flex-shrink: 0;
}

.chapter-status-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
  padding: 0;
}
.chapter-status-btn:hover { opacity: 1; background: var(--border); }


.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s;
  gap: 8px;
}

.chapter-item:hover { background: var(--bg-card); }
.chapter-item.active {
  background: var(--bg-card);
  border-left-color: var(--accent);
}

.chapter-item-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.chapter-item-title {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-item-words {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.chapter-item-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.chapter-item:hover .chapter-item-delete { opacity: 1; }
.chapter-item-delete:hover { color: var(--accent); }

/* ---- Éditeur ---- */
.ecriture-editor-panel {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chapter-title-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  flex-shrink: 0;
}

.chapter-title-input {
  flex: 1;
  background: none;
  border: none;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  outline: none;
}

.chapter-title-input::placeholder { color: var(--text-muted); }

.chapter-save-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  transition: all 0.2s;
  white-space: nowrap;
}
.chapter-save-btn:hover { border-color: var(--accent); color: var(--text); }

.chapter-save-btn.saving {
  border-color: var(--warning, #ff9800);
  color: var(--warning, #ff9800);
  cursor: default;
}
.chapter-save-btn.saved {
  border-color: var(--success, #4caf50);
  color: var(--success, #4caf50);
}

.csb-icon { font-size: 13px; line-height: 1; }
.csb-spin { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.editor-word-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.zoom-btn {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
  font-size: 15px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.15s;
  padding: 0;
}
.zoom-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.zoom-btn:disabled { opacity: 0.35; cursor: default; }

.zoom-level {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}
.zoom-level:hover { color: var(--accent); }

/* ---- Toolbar ---- */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  gap: 2px;
}

.toolbar-sep {
  width: 1px;
  height: 22px;
  background: var(--border);
  margin: 0 4px;
}

.toolbar-btn {
  padding: 4px 8px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
  min-width: 28px;
}

.toolbar-btn:hover { background: var(--bg-card); color: var(--text); }
.toolbar-btn.active { background: var(--accent); color: white; }

/* ---- Estimation pages ---- */
.page-est-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--accent);
  font-size: 11px;
  padding: 2px 7px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.page-est-btn:hover,
.page-est-btn.active { background: rgba(233,69,96,0.1); border-color: var(--accent); }

.page-est-panel {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.page-est-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--accent);
  margin: 0 0 2px;
}

.page-est-formats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.fmt-btn {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.fmt-btn:hover { border-color: var(--text-muted); color: var(--text); }
.fmt-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,0.08); }

.page-est-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.page-est-dims {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.page-est-margins {
  display: flex;
  gap: 6px;
}

.page-est-margins label {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

.est-input {
  width: 48px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  padding: 3px 5px;
  text-align: center;
}
.est-input:focus { outline: none; border-color: var(--accent); }

.est-input-sm {
  width: 36px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 11px;
  padding: 2px 4px;
  text-align: center;
}
.est-input-sm:focus { outline: none; border-color: var(--accent); }

.page-est-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

.page-est-result strong {
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}

.chapter-item-pages {
  opacity: 0.6;
  font-size: 10px;
}

/* ---- Réglages paragraphe ---- */
.para-settings-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 100;
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  min-width: 280px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.para-settings-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 4px;
}

.para-setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text);
  cursor: default;
}

.para-setting-row span:first-child {
  width: 130px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.para-setting-row input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
  cursor: pointer;
}

.para-val {
  width: 36px;
  text-align: right;
  font-size: 12px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* ---- Dropdown police custom ---- */
.font-picker {
  position: relative;
}

.font-picker-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  min-width: 130px;
  text-align: left;
  white-space: nowrap;
  transition: border-color 0.15s;
}
.font-picker-btn:hover,
.font-picker.open .font-picker-btn { border-color: var(--accent); }

.font-size-group { gap: 2px; }

.case-btn { font-size: 11px; font-weight: 600; letter-spacing: -0.5px; min-width: 26px; }
.font-size-select {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  height: 28px;
  padding: 0 4px;
  width: 62px;
  cursor: pointer;
  outline: none;
}
.font-size-select:hover { border-color: var(--accent); }

.font-picker-arrow {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
}

.font-picker-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 180px;
  max-height: 260px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  padding: 4px 0;
}

.font-picker-item {
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
  color: var(--text);
  transition: background 0.1s;
}
.font-picker-item:hover { background: var(--bg-card); }
.font-picker-item.active { color: var(--accent); }

/* ---- Page d'écriture ---- */
.editor-page-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px;
  background: var(--bg);
}

.editor-page {
  max-width: 720px;
  margin: 0 auto;
  background: var(--bg-card);
  border-radius: 8px;
  padding: 48px 56px;
  min-height: calc(100vh - 180px);
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
}

/* ---- ProseMirror (TipTap) ---- */
:deep(.prose-editor) {
  outline: none;
  min-height: calc(100vh - 380px);
  line-height: 1.9;
  font-size: 15px;
  color: var(--text);
}

:deep(.prose-editor p) {
  margin-top: var(--para-space-before, 0px);
  margin-bottom: var(--para-space-after, 12px);
  text-indent: var(--para-indent, 0em);
}
:deep(.prose-editor h1) { font-size: 26px; font-weight: 700; margin: 0 0 16px; color: var(--text); }
:deep(.prose-editor h2) { font-size: 20px; font-weight: 600; margin: 0 0 14px; color: var(--text); }
:deep(.prose-editor h3) { font-size: 16px; font-weight: 600; margin: 0 0 12px; color: var(--text-muted); }
:deep(.prose-editor strong) { font-weight: 700; }
:deep(.prose-editor em) { font-style: italic; }
:deep(.prose-editor u) { text-decoration: underline; }
:deep(.prose-editor s) { text-decoration: line-through; }
:deep(.prose-editor mark) { background: rgba(233, 69, 96, 0.3); border-radius: 2px; padding: 0 2px; }
:deep(.prose-editor p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
  float: left;
  height: 0;
}

/* ---- Bloc indenté ---- */
:deep(div[data-type="text-block"]) {
  border-left: 3px solid var(--accent);
  border-radius: 0 4px 4px 0;
  background: rgba(233, 69, 96, 0.05);
  padding: 4px 16px;
  transition: margin 0.15s;
}

.textblock-btn {
  letter-spacing: -2px;
  font-size: 11px;
}

.textblock-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.textblock-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.textblock-slider-label {
  font-size: 11px;
  color: var(--text-muted);
}

.textblock-slider {
  width: 80px;
  accent-color: var(--accent);
  cursor: pointer;
}

.textblock-val {
  font-size: 11px;
  color: var(--accent);
  width: 34px;
  font-variant-numeric: tabular-nums;
}

/* ---- Gestionnaire de polices ---- */
.font-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
  max-height: 300px;
  overflow-y: auto;
}

.font-empty {
  color: var(--text-muted);
  font-size: 13px;
  padding: 12px 0;
}

.font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--input-bg);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.font-preview {
  font-size: 16px;
  color: var(--text);
  flex: 1;
}

.font-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.font-delete:hover { color: var(--accent); }
</style>

<style>
/* Status picker — téléporté au body, ne peut pas être scoped */
.status-picker {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  z-index: 9999;
  min-width: 120px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.status-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  padding: 5px 8px;
  width: 100%;
  text-align: left;
  transition: background 0.12s;
}
.status-picker-item:hover { background: var(--input-bg); }
.status-picker-item.active { background: var(--input-bg); font-weight: 600; }
.spi-icon { font-size: 13px; width: 16px; text-align: center; }
.spi-label { font-size: 12px; color: var(--text); }
</style>

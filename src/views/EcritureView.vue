<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Node, Extension, Mark, mergeAttributes } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
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
// ---- Nœud Saut de page ----
const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'div[data-type="page-break"]' }] },
  renderHTML() { return ['div', { 'data-type': 'page-break', class: 'editor-page-break' }] },
  addCommands() {
    return {
      insertPageBreak: () => ({ chain }) =>
        chain().focus().insertContent({ type: 'pageBreak' }).run()
    }
  }
})

import Underline from '@tiptap/extension-underline'
import TextStyleBase from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'

// Étendre TextStyle pour ignorer les spans de lettrine (évite le cumul font-size au rechargement)
const TextStyle = TextStyleBase.extend({
  parseHTML() {
    return [{
      tag: 'span',
      getAttrs: el => {
        if (el.hasAttribute('data-drop-cap')) return false
        if (!el.hasAttribute('style')) return false
        return {}
      },
    }]
  },
})

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
        chain().setMark('textStyle', { fontSize: size ? `${size}pt` : null }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})
// ---- Extension Lettrine (Drop Cap) ----
const DropCap = Mark.create({
  name: 'dropCap',

  addAttributes() {
    return {
      lines: {
        default: 2,
        parseHTML: el => parseInt(el.getAttribute('data-drop-cap') || '2'),
      },
      font: {
        default: null,
        parseHTML: el => {
          const m = (el.getAttribute('style') || '').match(/font-family:\s*([^;]+)/)
          return m ? m[1].trim().replace(/['"]/g, '') : null
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-drop-cap]' }]
  },

  renderHTML({ mark }) {
    const lines = mark.attrs.lines || 2
    const font  = mark.attrs.font  || null
    // Taille : N lignes × hauteur de ligne (~1.5em) ÷ cap-height (~0.72) ≈ N × 2.08em
    const fontSize  = `${(lines * 2.1).toFixed(1)}em`
    const fontStyle = font ? `font-family: ${font};` : ''
    return ['span', mergeAttributes({
      'data-drop-cap': String(lines),
      style: `float:left; font-size:${fontSize}; line-height:0.72; margin-right:0.08em; ${fontStyle}`,
    }), 0]
  },
})

// ---- Extension styles de paragraphe par paragraphe ----
const ParagraphIndentStyle = Extension.create({
  name: 'paragraphIndentStyle',
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        indent: {
          default: null,
          parseHTML: el => el.style.textIndent   || null,
          renderHTML: a => a.indent   ? { style: `text-indent: ${a.indent}` }   : {},
        },
        spBefore: {
          default: null,
          parseHTML: el => el.style.marginTop    || null,
          renderHTML: a => a.spBefore ? { style: `margin-top: ${a.spBefore}` }  : {},
        },
        spAfter: {
          default: null,
          parseHTML: el => el.style.marginBottom || null,
          renderHTML: a => a.spAfter  ? { style: `margin-bottom: ${a.spAfter}` }: {},
        },
      },
    }]
  },
})

import TextAlign from '@tiptap/extension-text-align'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import ImageExt from '@tiptap/extension-image'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

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
  { value: null,        icon: '○', label: 'Aucun',    color: 'var(--color-muted)' },
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

// Fermer les dropdowns au clic extérieur
function onDocClick() {
  statusPickerOpenId.value = null
  showStyleDropdown.value = false
  showLinkPopup.value = false
  showSpecialChars.value = false
  ctxMenu.value = null
  showDropCapPanel.value = false
}

// Modal nouveau chapitre / partie
const showChapterModal = ref(false)
const modalTitle = ref('')
const modalPart = ref('')

// ---- Renommage de partie ----
const editingPart     = ref(null)   // nom actuel de la partie en cours d'édition
const editingPartName = ref('')     // valeur du champ input

function startEditPart(partName) {
  editingPart.value     = partName
  editingPartName.value = partName
  nextTick(() => document.getElementById('part-edit-input')?.select())
}

async function confirmEditPart() {
  const oldName = editingPart.value
  const newName = editingPartName.value.trim()
  editingPart.value = null
  if (!newName || newName === oldName) return
  // Mettre à jour tous les chapitres de cette partie
  const toUpdate = chapters.value.filter(c => c.part === oldName)
  await Promise.all(toUpdate.map(c => window.api.chapters.update(c.id, { part: newName })))
  toUpdate.forEach(c => { c.part = newName })
}

function cancelEditPart() {
  editingPart.value = null
}

const existingParts = computed(() =>
  [...new Set(chapters.value.map(c => c.part).filter(Boolean))]
)

// ---- Rechercher / Remplacer dans l'éditeur ----
const showFindReplace  = ref(false)
const findQuery        = ref('')
const replaceQuery     = ref('')
const findCaseSensitive = ref(false)
const findMatchCount   = ref(0)
const findCurrentIndex = ref(0)
let   _findMatches     = []

function _buildMatches() {
  _findMatches = []
  if (!editor.value || !findQuery.value.trim()) { findMatchCount.value = 0; return }
  const flags = findCaseSensitive.value ? 'g' : 'gi'
  const regex = new RegExp(findQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
  editor.value.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    let m
    regex.lastIndex = 0
    while ((m = regex.exec(node.text)) !== null)
      _findMatches.push({ from: pos + m.index, to: pos + m.index + m[0].length })
  })
  findMatchCount.value = _findMatches.length
}

function _selectMatch(idx) {
  if (!editor.value || !_findMatches.length) return
  const { from, to } = _findMatches[idx]
  editor.value.chain().focus().setTextSelection({ from, to }).run()
  editor.value.view.dispatch(editor.value.view.state.tr.scrollIntoView())
}

function findNext() {
  _buildMatches()
  if (!_findMatches.length) return
  findCurrentIndex.value = (findCurrentIndex.value + 1) % _findMatches.length
  _selectMatch(findCurrentIndex.value)
}

function findPrev() {
  _buildMatches()
  if (!_findMatches.length) return
  findCurrentIndex.value = (findCurrentIndex.value - 1 + _findMatches.length) % _findMatches.length
  _selectMatch(findCurrentIndex.value)
}

function doReplaceNext() {
  _buildMatches()
  if (!_findMatches.length) return
  const idx = Math.min(findCurrentIndex.value, _findMatches.length - 1)
  const { from, to } = _findMatches[idx]
  const { tr, schema } = editor.value.state
  replaceQuery.value ? tr.replaceWith(from, to, schema.text(replaceQuery.value)) : tr.delete(from, to)
  editor.value.view.dispatch(tr)
  _buildMatches()
  if (_findMatches.length) { findCurrentIndex.value = Math.min(idx, _findMatches.length - 1); _selectMatch(findCurrentIndex.value) }
}

function doReplaceAll() {
  _buildMatches()
  if (!_findMatches.length) return
  const { tr, schema } = editor.value.state
  for (const { from, to } of [..._findMatches].reverse())
    replaceQuery.value ? tr.replaceWith(from, to, schema.text(replaceQuery.value)) : tr.delete(from, to)
  editor.value.view.dispatch(tr)
  _buildMatches()
  findCurrentIndex.value = 0
}

function openFindReplace() {
  showFindReplace.value = true
  nextTick(() => document.getElementById('find-replace-input')?.focus())
}

function closeFindReplace() {
  showFindReplace.value = false
  findQuery.value = ''
  _findMatches = []
  findMatchCount.value = 0
  editor.value?.commands.focus()
}

watch(findQuery, () => {
  _buildMatches()
  findCurrentIndex.value = 0
  if (_findMatches.length) _selectMatch(0)
})

watch(findCaseSensitive, () => {
  _buildMatches()
  if (_findMatches.length) _selectMatch(Math.min(findCurrentIndex.value, _findMatches.length - 1))
})

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
const titleFont   = ref('')      // police du titre de chapitre
const partFont    = ref('')      // police du nom de partie
const titleAlign  = ref('left')  // alignement du titre
const partAlign   = ref('left')  // alignement de la partie
const titleSize   = ref(26)      // taille (px) du titre de chapitre
const partSize    = ref(13)      // taille (px) du nom de partie

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
  { id: 'roman',  label: 'Roman (135×210)',  short: 'Roman', w: 135, h: 210, svgW: 11, svgH: 17 },
  { id: 'poche',  label: 'Poche (108×177)',  short: 'Poche', w: 108, h: 177, svgW: 10, svgH: 17 },
  { id: 'a5',     label: 'A5 (148×210)',     short: 'A5',    w: 148, h: 210, svgW: 12, svgH: 17 },
  { id: 'a4',     label: 'A4 (210×297)',     short: 'A4',    w: 210, h: 297, svgW: 12, svgH: 17 },
  { id: 'custom', label: 'Personnalisé',     short: '···',   w: null, h: null, svgW: 12, svgH: 17 },
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

async function loadParaSettings() {
  const s = await window.api.para.get(props.projectId)
  indentSize.value  = s?.indentSize  ?? 0
  spaceBefore.value = s?.spaceBefore ?? 0
  spaceAfter.value  = s?.spaceAfter  ?? 12
  titleFont.value   = s?.titleFont   ?? ''
  partFont.value    = s?.partFont    ?? ''
  titleAlign.value  = s?.titleAlign  ?? 'left'
  partAlign.value   = s?.partAlign   ?? 'left'
  titleSize.value   = s?.titleSize   ?? 26
  partSize.value    = s?.partSize    ?? 13
}

function saveParaSettings() {
  window.api.para.set(props.projectId, {
    indentSize: indentSize.value,
    spaceBefore: spaceBefore.value,
    spaceAfter: spaceAfter.value,
    titleFont: titleFont.value,
    partFont: partFont.value,
    titleAlign: titleAlign.value,
    partAlign: partAlign.value,
    titleSize: titleSize.value,
    partSize: partSize.value,
  })
}

watch([indentSize, spaceBefore, spaceAfter, titleFont, partFont, titleAlign, partAlign, titleSize, partSize], saveParaSettings)

// ---- Réglages du paragraphe courant ----
const curIndent      = ref(0)
const curSpaceBefore = ref(0)
const curSpaceAfter  = ref(0)

function readCurrentParaAttrs() {
  if (!editor.value) return
  const attrs = editor.value.getAttributes('paragraph')
  curIndent.value      = attrs.indent   ? parseFloat(attrs.indent)   : indentSize.value
  curSpaceBefore.value = attrs.spBefore ? parseFloat(attrs.spBefore) : spaceBefore.value
  curSpaceAfter.value  = attrs.spAfter  ? parseFloat(attrs.spAfter)  : spaceAfter.value
}

function applyParaToCurrent() {
  if (!editor.value) return
  editor.value.chain().focus().updateAttributes('paragraph', {
    indent:   curIndent.value !== 0      ? `${curIndent.value}em`      : null,
    spBefore: curSpaceBefore.value !== 0 ? `${curSpaceBefore.value}px` : null,
    spAfter:  curSpaceAfter.value !== 0  ? `${curSpaceAfter.value}px`  : null,
  }).run()
}

function applyParaToAll() {
  if (!editor.value) return
  const { state, view } = editor.value
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      tr.setNodeMarkup(pos, null, {
        ...node.attrs,
        indent:   curIndent.value !== 0      ? `${curIndent.value}em`      : null,
        spBefore: curSpaceBefore.value !== 0 ? `${curSpaceBefore.value}px` : null,
        spAfter:  curSpaceAfter.value !== 0  ? `${curSpaceAfter.value}px`  : null,
      })
    }
  })
  view.dispatch(tr)
  // Mettre à jour aussi les réglages globaux (pour l'export Word et les nouveaux chapitres)
  indentSize.value  = curIndent.value
  spaceBefore.value = curSpaceBefore.value
  spaceAfter.value  = curSpaceAfter.value
}

watch(showParaSettings, (val) => { if (val) readCurrentParaAttrs() })

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

// ---- Style dropdown ----
const showStyleDropdown = ref(false)
const STYLES = [
  { label: 'Normal',    cmd: ed => ed.chain().focus().setParagraph().run() },
  { label: 'Titre 1',  cmd: ed => ed.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Titre 2',  cmd: ed => ed.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Titre 3',  cmd: ed => ed.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Titre 4',  cmd: ed => ed.chain().focus().toggleHeading({ level: 4 }).run() },
  { label: 'Titre 5',  cmd: ed => ed.chain().focus().toggleHeading({ level: 5 }).run() },
  { label: 'Titre 6',  cmd: ed => ed.chain().focus().toggleHeading({ level: 6 }).run() },
  { label: 'Citation', cmd: ed => ed.chain().focus().toggleBlockquote().run() },
  { label: 'Code',     cmd: ed => ed.chain().focus().toggleCodeBlock().run() },
]
const currentStyle = computed(() => {
  if (!editor.value) return 'Normal'
  for (let i = 1; i <= 6; i++) {
    if (editor.value.isActive('heading', { level: i })) return `Titre ${i}`
  }
  if (editor.value.isActive('blockquote')) return 'Citation'
  if (editor.value.isActive('codeBlock')) return 'Code'
  return 'Normal'
})

// ---- Lien ----
const showLinkPopup = ref(false)
const linkUrl = ref('')
const linkPopupStyle = ref({})

function openLinkPopup(e) {
  const r = e?.currentTarget?.getBoundingClientRect()
  if (r) linkPopupStyle.value = { top: r.bottom + 4 + 'px', left: r.left + 'px' }
  linkUrl.value = editor.value?.getAttributes('link').href || ''
  showLinkPopup.value = true
  showStyleDropdown.value = false
  showSpecialChars.value = false
}
function applyLink() {
  if (linkUrl.value.trim()) {
    editor.value?.chain().focus().setLink({ href: linkUrl.value.trim(), target: '_blank' }).run()
  } else {
    editor.value?.chain().focus().unsetLink().run()
  }
  showLinkPopup.value = false
  linkUrl.value = ''
}

// ---- Image ----
async function pickAndInsertImage() {
  const dataUrl = await window.api.editor.pickImage()
  if (dataUrl) editor.value?.chain().focus().setImage({ src: dataUrl }).run()
}

// ---- Caractères spéciaux ----
const showSpecialChars = ref(false)
const specialCharsStyle = ref({})
const SPECIAL_CHARS = [
  ['«', '»', '\u201C', '\u201D', '\u2018', '\u2019', '—', '–', '…', '°'],
  ['©', '®', '™', '§', '¶', '†', '•', '·', '‽', 'Nº'],
  ['½', '¼', '¾', '⅓', '⅔', '⅛', '⅜', '⅝', '⅞', 'ø'],
  ['×', '÷', '±', '≠', '≤', '≥', '∞', '≈', '√', 'π'],
]
function insertSpecialChar(char) {
  editor.value?.chain().focus().insertContent(char).run()
  showSpecialChars.value = false
}

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
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    Underline,
    TextStyle,
    FontFamily,
    FontSize,
    DropCap,
    ParagraphIndentStyle,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CharacterCount,
    Highlight.configure({ multicolor: false }),
    TextBlock,
    PageBreakNode,
    Link.configure({ openOnClick: false }),
    ImageExt,
    Superscript,
    Subscript,
    TaskList,
    TaskItem.configure({ nested: true }),
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
    currentFontSize.value = attrs.fontSize ? attrs.fontSize.replace(/[a-z]+$/i, '') : ''
  },
  onSelectionUpdate: ({ editor }) => {
    const attrs = editor.getAttributes('textStyle')
    currentFont.value = attrs.fontFamily || ''
    currentFontSize.value = attrs.fontSize ? attrs.fontSize.replace(/[a-z]+$/i, '') : ''
    if (showParaSettings.value) readCurrentParaAttrs()
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

let isOpeningChapter = false

async function openChapter(ch) {
  if (isOpeningChapter) return
  isOpeningChapter = true
  try {
    // Sauvegarder l'actuel avant de changer
    if (currentChapter.value && editor.value) {
      clearTimeout(saveTimer)
      await autoSave(editor.value)
    }
    const full = await window.api.chapters.get(ch.id)
    currentChapter.value = full
    chapterTitle.value = full.title
    pagePartName.value = full.part || ''
    activeHeaderBlock.value = null
    // false = ne pas émettre onUpdate (évite déclenchement d'un autosave au chargement)
    editor.value?.commands.setContent(full.content || '', false)
    // Recréer un EditorState propre pour vider totalement l'historique d'annulation.
    // (clearHistory n'existe pas dans cette version de TipTap)
    if (editor.value) {
      const freshState = EditorState.create({
        schema: editor.value.schema,
        doc: editor.value.state.doc,
        plugins: editor.value.state.plugins,
      })
      editor.value.view.updateState(freshState)
    }
    editor.value?.commands.focus()
  } finally {
    isOpeningChapter = false
  }
}

// ---- Édition directe en-tête page ----
const pagePartName      = ref('')   // valeur locale du nom de partie sur la page
const activeHeaderBlock = ref(null) // 'part' | 'title' | null

async function saveTitle() {
  if (!currentChapter.value) return
  const title = chapterTitle.value.trim() || 'Sans titre'
  chapterTitle.value = title
  await window.api.chapters.update(currentChapter.value.id, { title })
  currentChapter.value.title = title
  const idx = chapters.value.findIndex(c => c.id === currentChapter.value.id)
  if (idx !== -1) chapters.value[idx].title = title
}

async function savePagePart() {
  const oldName = currentChapter.value?.part
  const newName = pagePartName.value.trim()
  if (!newName || newName === oldName) return
  const toUpdate = chapters.value.filter(c => c.part === oldName)
  await Promise.all(toUpdate.map(c => window.api.chapters.update(c.id, { part: newName })))
  toUpdate.forEach(c => { c.part = newName })
  if (currentChapter.value) currentChapter.value.part = newName
}

let headerBlurTimer = null

function onHeaderFocus(block) {
  clearTimeout(headerBlurTimer)
  activeHeaderBlock.value = block
}

function onHeaderFocusIn() {
  clearTimeout(headerBlurTimer)
}

function onHeaderBlur(saveCallback) {
  clearTimeout(headerBlurTimer)
  headerBlurTimer = setTimeout(() => {
    const focused = document.activeElement
    if (focused && focused.closest('.page-chapter-header')) return
    activeHeaderBlock.value = null
    if (saveCallback) saveCallback()
  }, 150)
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

// ---- Drag & drop chapitres ----
const dragSrcId = ref(null)
const dragOverId = ref(null)

function onDragStart(e, ch) {
  dragSrcId.value = ch.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(ch.id))
}

function onDragOver(e, ch) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverId.value = ch.id
}

function onDragLeave() {
  dragOverId.value = null
}

async function onDrop(e, targetCh) {
  e.preventDefault()
  dragOverId.value = null
  if (!dragSrcId.value || dragSrcId.value === targetCh.id) { dragSrcId.value = null; return }

  // Construire le nouvel ordre : on retire la source et l'insère à la position de la cible
  const list = [...chapters.value]
  const srcIdx = list.findIndex(c => c.id === dragSrcId.value)
  const tgtIdx = list.findIndex(c => c.id === targetCh.id)
  if (srcIdx === -1 || tgtIdx === -1) { dragSrcId.value = null; return }

  const [moved] = list.splice(srcIdx, 1)
  list.splice(tgtIdx, 0, moved)

  // Renuméroter automatiquement les chapitres "Chapitre N"
  renumberChapters(list)

  const orders = list.map((c, i) => ({ id: c.id, position: i + 1 }))
  await window.api.chapters.reorder(orders)
  dragSrcId.value = null
  await loadChapters()
}

function onDragEnd() {
  dragSrcId.value = null
  dragOverId.value = null
}

// ---- Auto-renumérotation ----
// Renumérotation séquentielle de tous les chapitres dont le titre est "Chapitre N"
function renumberChapters(list) {
  let counter = 1
  for (const ch of list) {
    if (/^chapitre\s+\d+$/i.test(ch.title.trim())) {
      const newTitle = `Chapitre ${counter}`
      if (ch.title !== newTitle) {
        ch.title = newTitle
        window.api.chapters.update(ch.id, { title: newTitle })
      }
    }
    counter++
  }
}

// ---- Menu contextuel ----
const ctxMenu = ref(null) // { x, y, ch }

function onChapterContextMenu(e, ch) {
  e.preventDefault()
  ctxMenu.value = { x: e.clientX, y: e.clientY, ch }
}

function closeCtxMenu() {
  ctxMenu.value = null
}

async function ctxInsertBefore(ch) {
  closeCtxMenu()
  const idx = chapters.value.findIndex(c => c.id === ch.id)
  const insertPos = idx + 1  // position 1-based: same slot as current chapter
  const newCh = await window.api.chapters.insertAt({
    project_id: props.projectId,
    title: `Chapitre ${insertPos}`,
    part: ch.part ?? null,
    position: insertPos,
  })
  await loadChapters()
  renumberChapters(chapters.value)
  await openChapter(chapters.value.find(c => c.id === newCh.id) ?? newCh)
}

async function ctxInsertAfter(ch) {
  closeCtxMenu()
  const idx = chapters.value.findIndex(c => c.id === ch.id)
  const insertPos = idx + 2  // position after current chapter (1-based)
  const newCh = await window.api.chapters.insertAt({
    project_id: props.projectId,
    title: `Chapitre ${insertPos}`,
    part: ch.part ?? null,
    position: insertPos,
  })
  await loadChapters()
  renumberChapters(chapters.value)
  await openChapter(chapters.value.find(c => c.id === newCh.id) ?? newCh)
}

// ---- Lettrine (Drop Cap) ----
const showDropCapPanel = ref(false)
const dropCapPanelStyle = ref({})
const dropCapLines = ref(2)
const dropCapFont  = ref('')

function openDropCapPanel(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  dropCapPanelStyle.value = { top: (rect.bottom + 4) + 'px', left: rect.left + 'px' }
  // Lire les attrs actuels si une lettrine est déjà active
  if (editor.value?.isActive('dropCap')) {
    const attrs = editor.value.getAttributes('dropCap')
    dropCapLines.value = attrs.lines || 2
    dropCapFont.value  = attrs.font  || ''
  }
  showDropCapPanel.value = !showDropCapPanel.value
}

function applyDropCap() {
  if (!editor.value) return
  const { state, view } = editor.value
  const { $from } = state.selection
  const paraStart = $from.start($from.depth)
  const paraSize  = $from.parent.content.size
  if (paraSize === 0) return
  const markType = state.schema.marks.dropCap

  // Trouver la position du premier vrai caractère de texte (ignorer les HardBreak)
  const parent = $from.parent
  let firstTextPos = -1
  let offset = 0
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)
    if (child.isText) {
      firstTextPos = paraStart + offset
      break
    }
    offset += child.nodeSize
  }
  if (firstTextPos === -1) return // Pas de texte dans ce paragraphe

  const tr = state.tr
  // Retirer toute lettrine existante dans ce paragraphe
  tr.removeMark(paraStart, paraStart + paraSize, markType)
  // Appliquer sur le premier caractère de texte uniquement
  tr.addMark(firstTextPos, firstTextPos + 1, markType.create({
    lines: dropCapLines.value,
    font:  dropCapFont.value || null,
  }))
  view.dispatch(tr)
  showDropCapPanel.value = false
}

function removeDropCap() {
  if (!editor.value) return
  const { state, view } = editor.value
  const { $from } = state.selection
  const paraStart = $from.start($from.depth)
  const paraSize  = $from.parent.content.size
  const tr = state.tr
  tr.removeMark(paraStart, paraStart + paraSize, state.schema.marks.dropCap)
  view.dispatch(tr)
  showDropCapPanel.value = false
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
  await loadParaSettings()
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
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    if (currentChapter.value) openFindReplace()
  }
  if (e.key === 'Escape' && showFindReplace.value) {
    closeFindReplace()
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
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
        <button
          class="chapter-export-btn"
          :disabled="!chapters.length || exporting"
          title="Exporter tous les chapitres en Word (.docx)"
          @click="exportWord"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
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
              :title="fmt.label"
              @click="applyFormat(fmt)"
            >
              <svg :width="fmt.svgW" :height="fmt.svgH" :viewBox="`0 0 ${fmt.svgW} ${fmt.svgH}`">
                <rect
                  x="0.5" y="0.5"
                  :width="fmt.svgW - 1" :height="fmt.svgH - 1"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                  :stroke-dasharray="fmt.id === 'custom' ? '2,1' : 'none'"
                />
                <line v-if="fmt.id !== 'custom'" :x1="2" :y1="4" :x2="fmt.svgW - 2" :y2="4" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
                <line v-if="fmt.id !== 'custom'" :x1="2" :y1="7" :x2="fmt.svgW - 2" :y2="7" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
                <line v-if="fmt.id !== 'custom'" :x1="2" :y1="10" :x2="fmt.svgW - 4" :y2="10" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
              </svg>
              <span>{{ fmt.short }}</span>
            </button>
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
            <div v-if="group.part" class="chapter-part-header">
              <template v-if="editingPart === group.part">
                <input
                  id="part-edit-input"
                  v-model="editingPartName"
                  class="part-edit-input"
                  @keydown.enter.prevent="confirmEditPart"
                  @keydown.escape.prevent="cancelEditPart"
                  @blur="confirmEditPart"
                  @click.stop
                />
              </template>
              <template v-else>
                <span class="part-name">{{ group.part }}</span>
                <button
                  class="part-edit-btn"
                  title="Modifier le nom de la partie"
                  @click.stop="startEditPart(group.part)"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </template>
            </div>
            <div
              v-for="ch in group.items"
              :key="ch.id"
              class="chapter-item"
              :class="{
                active: currentChapter?.id === ch.id,
                'drag-over': dragOverId === ch.id,
              }"
              draggable="true"
              @click="openChapter(ch)"
              @contextmenu.prevent="onChapterContextMenu($event, ch)"
              @dragstart="onDragStart($event, ch)"
              @dragover="onDragOver($event, ch)"
              @dragleave="onDragLeave"
              @drop="onDrop($event, ch)"
              @dragend="onDragEnd"
            >
              <!-- Poignée drag -->
              <div class="chapter-drag-handle" title="Glisser pour réordonner">
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>
              </div>

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
              ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
        <!-- Barre supérieure : titre (lecture seule) + sauvegarde + zoom -->
        <div class="chapter-title-bar">
          <span class="chapter-title-label">{{ chapterTitle || 'Sans titre' }}</span>
          <button
            class="chapter-save-btn"
            :class="saveStatus || 'idle'"
            :title="saveStatus === 'saving' ? 'Sauvegarde en cours…' : saveStatus === 'saved' ? 'Sauvegardé' : 'Sauvegarder (Ctrl+S)'"
            @click="forceSaveNow"
          >
            <span v-if="saveStatus === 'saving'" class="csb-icon csb-spin"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin-icon"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
            <span v-else-if="saveStatus === 'saved'" class="csb-icon">✓</span>
            <span v-else class="csb-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span>
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

          <!-- Style dropdown -->
          <div class="toolbar-group" style="position:relative">
            <button
              class="style-picker-btn"
              @click.stop="showStyleDropdown = !showStyleDropdown; showFontDropdown = false; showLinkPopup = false; showSpecialChars = false"
              title="Style de paragraphe"
            >{{ currentStyle }}<span class="font-picker-arrow">▾</span></button>
            <div v-if="showStyleDropdown" class="style-picker-list" @click.stop>
              <div
                v-for="s in STYLES" :key="s.label"
                class="style-picker-item"
                :class="{ active: currentStyle === s.label }"
                :data-style="s.label"
                @click="s.cmd(editor); showStyleDropdown = false"
              >{{ s.label }}</div>
            </div>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Formatage -->
          <div class="toolbar-group">
            <button class="toolbar-btn" :class="{ active: editor.isActive('bold') }" title="Gras (Ctrl+B)" @click="editor.chain().focus().toggleBold().run()"><b>G</b></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('italic') }" title="Italique (Ctrl+I)" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('underline') }" title="Souligné (Ctrl+U)" @click="editor.chain().focus().toggleUnderline().run()"><u>S</u></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('strike') }" title="Barré" @click="editor.chain().focus().toggleStrike().run()"><s>B</s></button>
            <button class="toolbar-btn sup-btn" :class="{ active: editor.isActive('superscript') }" title="Exposant" @click="editor.chain().focus().toggleSuperscript().run()">x²</button>
            <button class="toolbar-btn sup-btn" :class="{ active: editor.isActive('subscript') }" title="Indice" @click="editor.chain().focus().toggleSubscript().run()">x₂</button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('highlight') }" title="Surligner" @click="editor.chain().focus().toggleHighlight().run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><path d="M15 5l3 3"/></svg></button>
            <button class="toolbar-btn" title="Effacer la mise en forme" @click="editor.chain().focus().clearNodes().unsetAllMarks().run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path d="M6.5 17.5l3-3"/></svg></button>
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
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'left' }) }" title="Gauche" @click="editor.chain().focus().setTextAlign('left').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="3" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="3" y="19" width="10" height="2" rx="1"/></svg></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'center' }) }" title="Centrer" @click="editor.chain().focus().setTextAlign('center').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="6" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="7" y="19" width="10" height="2" rx="1"/></svg></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'right' }) }" title="Droite" @click="editor.chain().focus().setTextAlign('right').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="9" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="11" y="19" width="10" height="2" rx="1"/></svg></button>
            <button class="toolbar-btn" :class="{ active: editor.isActive({ textAlign: 'justify' }) }" title="Justifier" @click="editor.chain().focus().setTextAlign('justify').run()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="3" y="9" width="18" height="2" rx="1"/><rect x="3" y="14" width="18" height="2" rx="1"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg></button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Lettrine -->
          <div class="toolbar-group" style="position:relative">
            <button
              class="toolbar-btn drop-cap-btn"
              :class="{ active: editor.isActive('dropCap') }"
              title="Lettrine (début de paragraphe)"
              @click.stop="openDropCapPanel($event)"
            >
              <span class="drop-cap-icon">A</span><span class="drop-cap-icon-rest">bc</span>
            </button>
            <Teleport to="body">
              <div v-if="showDropCapPanel" class="drop-cap-panel" :style="dropCapPanelStyle" @click.stop>
                <div class="dcp-title">Lettrine</div>
                <!-- Nombre de lignes -->
                <div class="dcp-row">
                  <span class="dcp-label">Hauteur</span>
                  <div class="dcp-lines">
                    <button
                      v-for="n in [1,2,3,4]" :key="n"
                      class="dcp-line-btn"
                      :class="{ active: dropCapLines === n }"
                      @click="dropCapLines = n"
                    >{{ n }} ligne{{ n > 1 ? 's' : '' }}</button>
                  </div>
                </div>
                <!-- Police -->
                <div class="dcp-row">
                  <span class="dcp-label">Police</span>
                  <select v-model="dropCapFont" class="dcp-select">
                    <option value="">Par défaut</option>
                    <option v-for="f in allFonts.filter(f => f.value)" :key="f.value" :value="f.value">{{ f.label }}</option>
                  </select>
                </div>
                <!-- Aperçu -->
                <div class="dcp-preview" :style="{
                  fontFamily: dropCapFont || 'inherit',
                  fontSize: `${dropCapLines * 2.1}em`,
                  lineHeight: `${dropCapLines * 1.47}em`,
                }">A</div>
                <!-- Actions -->
                <div class="dcp-actions">
                  <button class="btn-primary btn-sm" @click="applyDropCap">Appliquer</button>
                  <button v-if="editor.isActive('dropCap')" class="btn-danger btn-sm" @click="removeDropCap">Retirer</button>
                </div>
              </div>
              <div v-if="showDropCapPanel" class="drop-cap-backdrop" @click="showDropCapPanel = false" />
            </Teleport>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Listes -->
          <div class="toolbar-group">
            <button class="toolbar-btn" :class="{ active: editor.isActive('bulletList') }" title="Liste à puces" @click="editor.chain().focus().toggleBulletList().run()">• −</button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('orderedList') }" title="Liste numérotée" @click="editor.chain().focus().toggleOrderedList().run()">1.</button>
            <button class="toolbar-btn" :class="{ active: editor.isActive('taskList') }" title="Liste de cases à cocher" @click="editor.chain().focus().toggleTaskList().run()">☑</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Insertion -->
          <div class="toolbar-group" style="position:relative">
            <!-- Lien -->
            <button
              class="toolbar-btn"
              :class="{ active: editor.isActive('link') }"
              title="Insérer / modifier un lien"
              @click.stop="openLinkPopup($event)"
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
            <div v-if="showLinkPopup" class="link-popup" :style="linkPopupStyle" @click.stop>
              <input
                v-model="linkUrl"
                type="url"
                placeholder="https://..."
                class="link-input"
                @keydown.enter="applyLink"
                @keydown.escape="showLinkPopup = false"
              >
              <button class="btn-primary btn-sm" @click="applyLink">OK</button>
              <button v-if="editor.isActive('link')" class="btn-danger btn-sm" @click="editor.chain().focus().unsetLink().run(); showLinkPopup = false">✕</button>
            </div>

            <!-- Image -->
            <button class="toolbar-btn" title="Insérer une image (fichier local)" @click="pickAndInsertImage"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>

            <!-- Caractères spéciaux -->
            <button
              class="toolbar-btn"
              :class="{ active: showSpecialChars }"
              title="Caractères spéciaux"
              @click.stop="(e) => { const r = e.currentTarget.getBoundingClientRect(); specialCharsStyle = { top: r.bottom + 4 + 'px', left: r.left + 'px' }; showSpecialChars = !showSpecialChars; showLinkPopup = false; showStyleDropdown = false }"
            >Ω</button>
            <div v-if="showSpecialChars" class="special-chars-popup" :style="specialCharsStyle" @click.stop>
              <div v-for="(row, ri) in SPECIAL_CHARS" :key="ri" class="special-chars-row">
                <button
                  v-for="char in row" :key="char"
                  class="special-char-btn"
                  :title="char"
                  @click="insertSpecialChar(char)"
                >{{ char }}</button>
              </div>
            </div>

            <!-- Saut de page -->
            <button
              class="toolbar-btn"
              title="Insérer un saut de page"
              @click="editor.chain().focus().insertPageBreak().run()"
            >⊟</button>
          </div>

          <div class="toolbar-sep"></div>

          <!-- Rechercher / Remplacer -->
          <div class="toolbar-group">
            <button
              class="toolbar-btn"
              :class="{ active: showFindReplace }"
              title="Rechercher / Remplacer (Ctrl+F)"
              @click="showFindReplace ? closeFindReplace() : openFindReplace()"
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
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
              <div class="para-settings-subtitle">Paragraphe courant</div>
              <label class="para-setting-row">
                <span>Retrait 1ère ligne</span>
                <input type="range" v-model.number="curIndent" min="0" max="5" step="0.5" @input="applyParaToCurrent">
                <span class="para-val">{{ curIndent }}em</span>
              </label>
              <label class="para-setting-row">
                <span>Espace avant</span>
                <input type="range" v-model.number="curSpaceBefore" min="0" max="48" step="2" @input="applyParaToCurrent">
                <span class="para-val">{{ curSpaceBefore }}px</span>
              </label>
              <label class="para-setting-row">
                <span>Espace après</span>
                <input type="range" v-model.number="curSpaceAfter" min="0" max="48" step="2" @input="applyParaToCurrent">
                <span class="para-val">{{ curSpaceAfter }}px</span>
              </label>
              <button class="para-apply-all-btn" @click="applyParaToAll">
                Appliquer à tous les paragraphes
              </button>
              <div class="para-settings-sep"></div>
              <label class="para-setting-row">
                <span>Police titre chapitre</span>
                <select v-model="titleFont" class="para-font-select">
                  <option value="">Par défaut</option>
                  <option v-for="f in allFonts.filter(f => f.value)" :key="f.value" :value="f.value" :style="{ fontFamily: f.value }">{{ f.label }}</option>
                </select>
              </label>
              <label class="para-setting-row">
                <span>Police nom de partie</span>
                <select v-model="partFont" class="para-font-select">
                  <option value="">Par défaut</option>
                  <option v-for="f in allFonts.filter(f => f.value)" :key="f.value" :value="f.value" :style="{ fontFamily: f.value }">{{ f.label }}</option>
                </select>
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
                @click.stop="showFontDropdown = !showFontDropdown; showStyleDropdown = false"
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
            <button class="toolbar-btn" title="Gérer les polices" @click="showFontManager = true; showFontDropdown = false"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></button>
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
              <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }}pt</option>
            </select>
            <button class="toolbar-btn" title="Augmenter la taille" @click="applyFontSize(Math.min(200, (parseInt(currentFontSize) || 15) + 1))">+</button>
          </div>

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

          <!-- Contrôles contextuels du bloc -->
          <template v-if="inTextBlock">
            <div class="toolbar-sep"></div>
            <div class="toolbar-group textblock-controls">
              <span class="textblock-label">Bloc :</span>
              <span class="textblock-slider-label">◀</span>
              <input type="range" :value="textBlockAttrs.marginLeft" min="0" max="300" step="8" class="textblock-slider" @input="e => updateTextBlock('marginLeft', +e.target.value)">
              <span class="textblock-val">{{ textBlockAttrs.marginLeft }}px</span>
              <span class="textblock-slider-label">▶</span>
              <input type="range" :value="textBlockAttrs.marginRight" min="0" max="300" step="8" class="textblock-slider" @input="e => updateTextBlock('marginRight', +e.target.value)">
              <span class="textblock-val">{{ textBlockAttrs.marginRight }}px</span>
            </div>
          </template>
        </div>

        <!-- Panneau Rechercher / Remplacer -->
        <Teleport to="body">
          <div v-if="showFindReplace" class="find-replace-panel" @click.stop @keydown.stop>
            <div class="find-replace-header">
              <span class="find-replace-title">Rechercher / Remplacer</span>
              <button class="find-close-btn" @click="closeFindReplace" title="Fermer (Échap)">✕</button>
            </div>
            <div class="find-replace-row">
              <input
                id="find-replace-input"
                v-model="findQuery"
                placeholder="Rechercher…"
                class="find-input"
                @keydown.enter.prevent="findNext"
                @keydown.shift.enter.prevent="findPrev"
                @keydown.escape.prevent="closeFindReplace"
              />
              <button class="find-case-btn" :class="{ active: findCaseSensitive }" @click="findCaseSensitive = !findCaseSensitive" title="Respecter la casse">Aa</button>
              <button class="find-nav-btn" @click="findPrev" :disabled="!findMatchCount" title="Précédent (Shift+Entrée)">↑</button>
              <button class="find-nav-btn" @click="findNext" :disabled="!findMatchCount" title="Suivant (Entrée)">↓</button>
              <span class="find-count" :class="{ 'find-no-result': findQuery && !findMatchCount }">
                {{ findQuery ? (findMatchCount ? `${findCurrentIndex + 1} / ${findMatchCount}` : 'Aucun résultat') : '' }}
              </span>
            </div>
            <div class="find-replace-row">
              <input
                v-model="replaceQuery"
                placeholder="Remplacer par…"
                class="find-input"
                @keydown.enter.prevent="doReplaceNext"
                @keydown.escape.prevent="closeFindReplace"
              />
              <button class="find-action-btn" @click="doReplaceNext" :disabled="!findMatchCount">Remplacer</button>
              <button class="find-action-btn" @click="doReplaceAll" :disabled="!findMatchCount">Tout remplacer</button>
            </div>
          </div>
        </Teleport>

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
            <!-- En-tête chapitre sur la page -->
            <div class="page-chapter-header" @focusin="onHeaderFocusIn">

              <!-- Bloc Partie -->
              <div v-if="currentChapter.part !== undefined" class="page-header-block">
                <!-- Barre de format : s'affiche quand le bloc est actif -->
                <div v-if="activeHeaderBlock === 'part'" class="header-format-bar">
                  <select class="hfb-font-select" v-model="partFont">
                    <option value="">Police…</option>
                    <option v-for="f in allFonts.filter(f => f.value)" :key="f.value" :value="f.value" :style="{ fontFamily: f.value }">{{ f.label }}</option>
                  </select>
                  <select class="hfb-size-select" v-model.number="partSize">
                    <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }}pt</option>
                  </select>
                  <button class="hfb-align-btn" :class="{ active: partAlign === 'left' }"    @click="partAlign = 'left'"    title="Aligner à gauche"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg></button>
                  <button class="hfb-align-btn" :class="{ active: partAlign === 'center' }"  @click="partAlign = 'center'"  title="Centrer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></button>
                  <button class="hfb-align-btn" :class="{ active: partAlign === 'right' }"   @click="partAlign = 'right'"   title="Aligner à droite"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg></button>
                  <button class="hfb-align-btn" :class="{ active: partAlign === 'justify' }" @click="partAlign = 'justify'" title="Justifier"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
                </div>
                <input
                  v-model="pagePartName"
                  class="page-header-input page-part-input"
                  placeholder="Nom de la partie…"
                  :style="{ fontFamily: partFont || undefined, fontSize: (partSize * 4 / 3) + 'px', textAlign: partAlign }"
                  @focus="onHeaderFocus('part')"
                  @blur="onHeaderBlur(savePagePart)"
                  @keydown.enter.prevent="$event.target.blur()"
                />
              </div>

              <!-- Bloc Chapitre -->
              <div class="page-header-block">
                <div v-if="activeHeaderBlock === 'title'" class="header-format-bar">
                  <select class="hfb-font-select" v-model="titleFont">
                    <option value="">Police…</option>
                    <option v-for="f in allFonts.filter(f => f.value)" :key="f.value" :value="f.value" :style="{ fontFamily: f.value }">{{ f.label }}</option>
                  </select>
                  <select class="hfb-size-select" v-model.number="titleSize">
                    <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }}pt</option>
                  </select>
                  <button class="hfb-align-btn" :class="{ active: titleAlign === 'left' }"    @click="titleAlign = 'left'"    title="Aligner à gauche"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg></button>
                  <button class="hfb-align-btn" :class="{ active: titleAlign === 'center' }"  @click="titleAlign = 'center'"  title="Centrer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></button>
                  <button class="hfb-align-btn" :class="{ active: titleAlign === 'right' }"   @click="titleAlign = 'right'"   title="Aligner à droite"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg></button>
                  <button class="hfb-align-btn" :class="{ active: titleAlign === 'justify' }" @click="titleAlign = 'justify'" title="Justifier"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
                </div>
                <input
                  v-model="chapterTitle"
                  class="page-header-input page-chapter-input"
                  placeholder="Titre du chapitre…"
                  :style="{ fontFamily: titleFont || undefined, fontSize: (titleSize * 4 / 3) + 'px', textAlign: titleAlign }"
                  @focus="onHeaderFocus('title')"
                  @blur="onHeaderBlur(saveTitle)"
                  @keydown.enter.prevent="$event.target.blur()"
                />
              </div>

            </div>

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

  <!-- Menu contextuel chapitres -->
  <Teleport to="body">
    <div
      v-if="ctxMenu"
      class="ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
    >
      <button class="ctx-menu-item" @click="ctxInsertBefore(ctxMenu.ch)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Insérer un chapitre avant
      </button>
      <button class="ctx-menu-item" @click="ctxInsertAfter(ctxMenu.ch)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Insérer un chapitre après
      </button>
    </div>
    <div v-if="ctxMenu" class="ctx-menu-backdrop" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu" />
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
/* ---- Style dropdown ---- */
.style-picker-btn {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  cursor: pointer;
  font-size: 12px;
  padding: 3px 8px;
  min-width: 90px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 28px;
  white-space: nowrap;
}
.style-picker-btn:hover { border-color: var(--color-accent); }

.style-picker-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--color-sidebar);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  z-index: 9999;
  min-width: 140px;
  overflow: hidden;
}

.style-picker-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s;
}
.style-picker-item:hover { background: var(--color-card); }
.style-picker-item.active { color: var(--color-accent); }
.style-picker-item[data-style="Titre 1"] { font-size: 18px; font-weight: 700; }
.style-picker-item[data-style="Titre 2"] { font-size: 16px; font-weight: 700; }
.style-picker-item[data-style="Titre 3"] { font-size: 14px; font-weight: 600; }
.style-picker-item[data-style="Titre 4"] { font-size: 13px; font-weight: 600; }
.style-picker-item[data-style="Citation"] { font-style: italic; border-left: 3px solid var(--color-accent); padding-left: 8px; }
.style-picker-item[data-style="Code"] { font-family: monospace; font-size: 12px; }

/* ---- Boutons exposant/indice ---- */
.sup-btn { font-size: 11px; }

/* ---- Popup lien ---- */
.link-popup {
  position: fixed;
  background: var(--color-sidebar);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  z-index: 9999;
  padding: 8px;
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 280px;
}

.link-input {
  flex: 1;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 4px 8px;
}
.link-input:focus { outline: none; border-color: var(--color-accent); }

/* ---- Popup caractères spéciaux ---- */
.special-chars-popup {
  position: fixed;
  background: var(--color-sidebar);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.85);
  z-index: 9999;
  padding: 8px;
  isolation: isolate;
}
.theme-light .special-chars-popup,
:root.theme-light .special-chars-popup {
  background: #e4e0d9;
}
.theme-light .link-popup,
:root.theme-light .link-popup {
  background: #e4e0d9;
}

.special-chars-row {
  display: flex;
  gap: 2px;
  margin-bottom: 2px;
}

.special-char-btn {
  width: 28px;
  height: 28px;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}
.special-char-btn:hover { background: var(--color-accent); color: white; border-color: var(--color-accent); }

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
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-muted);
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
.chapter-search-toggle.active { border-color: var(--color-accent); color: var(--color-accent); background: rgba(233,69,96,0.08); }

.chapter-export-btn {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 16px;
  width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.chapter-export-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); background: rgba(233,69,96,0.08); }
.chapter-export-btn:disabled { opacity: 0.35; cursor: default; }

/* ---- Recherche ---- */
.search-input-wrap {
  position: relative;
  padding: 10px 14px 6px;
}

.search-input {
  width: 100%;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-tx);
  font-size: 13px;
  padding: 7px 28px 7px 10px;
  box-sizing: border-box;
}
.search-input:focus { outline: none; border-color: var(--color-accent); }

.search-spinner {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted);
  font-size: 16px;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 8px;
}

.search-empty {
  padding: 12px 14px;
  color: var(--color-muted);
  font-size: 12px;
}

.search-result-item {
  padding: 10px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s;
}
.search-result-item:hover { background: var(--color-card); border-left-color: var(--color-accent); }

.search-result-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.search-result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-tx);
}

.search-result-count {
  font-size: 11px;
  color: var(--color-accent);
  font-weight: 600;
}

.search-result-part {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 4px;
}

.search-result-snippet {
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.5;
  margin: 3px 0 0;
  border-left: 2px solid var(--color-border);
  padding-left: 6px;
}

.search-result-snippet + .search-result-snippet {
  margin-top: 4px;
}

:deep(.search-result-snippet mark) {
  background: rgba(233, 69, 96, 0.35);
  color: var(--color-tx);
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
  color: var(--color-muted);
  border-bottom: 1px solid var(--color-border);
}

.chapter-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 120px;
}

.chapter-empty-hint {
  padding: 16px;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
}

.chapter-part-header {
  padding: 10px 14px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--color-accent);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.part-name { flex: 1; }
.part-edit-btn {
  opacity: 0.3;
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: opacity 0.15s, background 0.15s;
}
.part-edit-btn:hover {
  opacity: 1;
  background: rgba(233, 69, 96, 0.12);
}
.part-edit-input {
  flex: 1;
  background: var(--color-input);
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  color: var(--color-accent);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 2px 6px;
  outline: none;
  width: 100%;
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
.chapter-status-btn:hover { opacity: 1; background: var(--color-border); }


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

.chapter-item:hover { background: var(--color-card); }
.chapter-item.active {
  background: var(--color-card);
  border-left-color: var(--color-accent);
}
.chapter-item.drag-over {
  border-top: 2px solid var(--color-accent);
  background: var(--color-card);
}
.chapter-item[draggable="true"] { cursor: grab; }
.chapter-item[draggable="true"]:active { cursor: grabbing; }

.chapter-item-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.chapter-item-title {
  font-size: 13px;
  color: var(--color-tx);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-item-words {
  font-size: 11px;
  color: var(--color-muted);
  margin-top: 2px;
}

.chapter-item-delete {
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.chapter-item:hover .chapter-item-delete { opacity: 1; }
.chapter-item-delete:hover { color: var(--color-accent); }

.chapter-drag-handle {
  color: var(--color-muted);
  opacity: 0;
  flex-shrink: 0;
  cursor: grab;
  display: flex;
  align-items: center;
  transition: opacity 0.15s;
}
.chapter-item:hover .chapter-drag-handle { opacity: 0.5; }
.chapter-drag-handle:hover { opacity: 1 !important; }

/* ---- Menu contextuel ---- */
.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  padding: 4px;
  min-width: 200px;
}
.ctx-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--color-tx);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.ctx-menu-item:hover { background: var(--color-border); }
.ctx-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

/* ---- Lettrine ---- */
.drop-cap-btn {
  display: flex;
  align-items: baseline;
  gap: 1px;
  font-weight: bold;
  line-height: 1;
}
.drop-cap-icon {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}
.drop-cap-icon-rest {
  font-size: 11px;
  font-weight: 400;
}

.drop-cap-panel {
  position: fixed;
  z-index: 9999;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.25);
  padding: 14px 16px;
  min-width: 240px;
}
.dcp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-tx);
  margin-bottom: 12px;
}
.dcp-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.dcp-label {
  font-size: 11px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.dcp-lines {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.dcp-line-btn {
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-tx);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.dcp-line-btn.active,
.dcp-line-btn:hover { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.dcp-select {
  background: var(--color-input, var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 5px 8px;
  width: 100%;
}
.dcp-preview {
  float: left;
  color: var(--color-tx);
  margin-right: 8px;
  margin-bottom: 4px;
  line-height: 1;
  font-weight: 700;
  min-width: 40px;
  text-align: center;
}
.dcp-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  clear: both;
}
.drop-cap-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

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
  border-bottom: 1px solid var(--color-border);
  background: var(--color-sidebar);
  flex-shrink: 0;
}

/* ---- Label titre dans la barre supérieure ---- */
.chapter-title-label {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-tx);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- En-tête chapitre sur la page ---- */
.page-chapter-header {
  padding: 32px 60px 20px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.page-header-block {
  position: relative;
  display: flex;
  flex-direction: column;
}

/* Barre de formatage inline */
.header-format-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--color-toolbar, var(--color-sidebar));
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
  width: fit-content;
}

.hfb-font-select {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 2px 4px;
  max-width: 130px;
  cursor: pointer;
}

.hfb-size-select {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 2px 4px;
  width: 60px;
  cursor: pointer;
}

.hfb-align-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--color-muted);
  cursor: pointer;
  padding: 3px 5px;
  transition: all 0.15s;
}
.hfb-align-btn:hover  { background: var(--color-input); color: var(--color-tx); }
.hfb-align-btn.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }

/* Inputs éditables sur la page */
.page-header-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  outline: none;
  color: var(--color-tx);
  font-weight: 700;
  width: 100%;
  transition: border-color 0.15s;
  padding: 2px 0;
}
.page-header-input:hover  { border-bottom-color: var(--color-border); }
.page-header-input:focus  { border-bottom-color: var(--color-accent); }
.page-header-input::placeholder { color: var(--color-muted); opacity: 0.4; font-weight: 400; }

.page-part-input   { color: var(--color-accent); }
.page-chapter-input { }

.para-font-select {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 2px 4px;
  max-width: 130px;
}

.chapter-save-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-input);
  color: var(--color-muted);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  transition: all 0.2s;
  white-space: nowrap;
}
.chapter-save-btn:hover { border-color: var(--color-accent); color: var(--color-tx); }

.chapter-save-btn.saving {
  border-color: var(--warning, #ff9800);
  color: var(--warning, #ff9800);
  cursor: default;
}
.chapter-save-btn.saved {
  border-color: var(--color-success, #4caf50);
  color: var(--color-success, #4caf50);
}

.csb-icon { font-size: 13px; line-height: 1; }
.csb-spin { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.editor-word-count {
  font-size: 12px;
  color: var(--color-muted);
  white-space: nowrap;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.zoom-btn {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
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
.zoom-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.zoom-btn:disabled { opacity: 0.35; cursor: default; }

.zoom-level {
  font-size: 12px;
  color: var(--color-muted);
  min-width: 36px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}
.zoom-level:hover { color: var(--color-accent); }

/* ---- Saut de page ---- */
:deep(.editor-page-break) {
  display: block;
  border-top: 1px dashed var(--color-muted);
  margin: 16px 0;
  position: relative;
  cursor: default;
  user-select: none;
}
:deep(.editor-page-break)::after {
  content: '— saut de page —';
  position: absolute;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
  top: 0;
  background: var(--color-bg);
  padding: 0 10px;
  font-size: 10px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

/* ---- Toolbar ---- */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px;
  background: var(--color-sidebar);
  border-bottom: 1px solid var(--color-border);
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
  background: var(--color-border);
  margin: 0 4px;
}

.toolbar-btn {
  padding: 4px 8px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--color-tx);
  opacity: 0.6;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
  min-width: 28px;
}
.toolbar-btn:not(.active):not(:hover) { opacity: 0.6; }

.toolbar-btn:hover { background: var(--color-card); color: var(--color-tx); opacity: 1; }
.toolbar-btn.active { background: var(--color-accent); color: white; }

/* ---- Estimation pages ---- */
.page-est-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-accent);
  font-size: 11px;
  padding: 2px 7px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.page-est-btn:hover,
.page-est-btn.active { background: rgba(233,69,96,0.1); border-color: var(--color-accent); }

.page-est-panel {
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
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
  color: var(--color-accent);
  margin: 0 0 2px;
}

.page-est-formats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.fmt-btn {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-muted);
  font-size: 10px;
  padding: 5px 8px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.fmt-btn:hover { border-color: var(--color-muted); color: var(--color-tx); }
.fmt-btn.active { border-color: var(--color-accent); color: var(--color-accent); background: rgba(233,69,96,0.08); }

.page-est-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--color-muted);
}

.page-est-dims {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-muted);
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
  color: var(--color-muted);
}

.est-input {
  width: 48px;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 3px 5px;
  text-align: center;
}
.est-input:focus { outline: none; border-color: var(--color-accent); }

.est-input-sm {
  width: 36px;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 11px;
  padding: 2px 4px;
  text-align: center;
}
.est-input-sm:focus { outline: none; border-color: var(--color-accent); }

.page-est-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-muted);
}

.page-est-result strong {
  font-size: 13px;
  color: var(--color-accent);
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
  background: var(--color-sidebar);
  border: 1px solid var(--color-border);
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
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 4px;
}
.para-settings-subtitle {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: -4px;
}
.para-apply-all-btn {
  width: 100%;
  padding: 6px 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-tx);
  font-size: 12px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.para-apply-all-btn:hover { background: var(--color-border); }
.para-settings-sep {
  height: 1px;
  background: var(--color-border);
  margin: 0 -4px;
}

.para-setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--color-tx);
  cursor: default;
}

.para-setting-row span:first-child {
  width: 130px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-muted);
}

.para-setting-row input[type="range"] {
  flex: 1;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.para-val {
  width: 36px;
  text-align: right;
  font-size: 12px;
  color: var(--color-accent);
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
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-tx);
  font-size: 13px;
  cursor: pointer;
  min-width: 130px;
  text-align: left;
  white-space: nowrap;
  transition: border-color 0.15s;
}
.font-picker-btn:hover,
.font-picker.open .font-picker-btn { border-color: var(--color-accent); }

.font-size-group { gap: 2px; }

.case-btn { font-size: 11px; font-weight: 600; letter-spacing: -0.5px; min-width: 26px; }
.font-size-select {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-tx);
  font-size: 12px;
  height: 28px;
  padding: 0 4px;
  width: 62px;
  cursor: pointer;
  outline: none;
}
.font-size-select:hover { border-color: var(--color-accent); }

.font-picker-arrow {
  margin-left: auto;
  font-size: 10px;
  color: var(--color-muted);
}

.font-picker-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: var(--color-sidebar);
  border: 1px solid var(--color-border);
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
  color: var(--color-tx);
  transition: background 0.1s;
}
.font-picker-item:hover { background: var(--color-card); }
.font-picker-item.active { color: var(--color-accent); }

/* ---- Page d'écriture ---- */
.editor-page-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px;
  background: var(--color-bg);
}

.editor-page {
  max-width: 720px;
  margin: 0 auto;
  background: var(--color-card);
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
  color: var(--color-tx);
}

:deep(.prose-editor p) {
  margin-top: var(--para-space-before, 0px);
  margin-bottom: var(--para-space-after, 12px);
  text-indent: var(--para-indent, 0em);
}
:deep(.prose-editor h1) { font-size: 26px; font-weight: 700; margin: 0 0 16px; color: var(--color-tx); }
:deep(.prose-editor h2) { font-size: 20px; font-weight: 600; margin: 0 0 14px; color: var(--color-tx); }
:deep(.prose-editor h3) { font-size: 16px; font-weight: 600; margin: 0 0 12px; color: var(--color-muted); }
:deep(.prose-editor strong) { font-weight: 700; }
:deep(.prose-editor em) { font-style: italic; }
:deep(.prose-editor u) { text-decoration: underline; }
:deep(.prose-editor s) { text-decoration: line-through; }
:deep(.prose-editor mark) { background: rgba(233, 69, 96, 0.3); border-radius: 2px; padding: 0 2px; }
:deep(.prose-editor p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--color-muted);
  pointer-events: none;
  float: left;
  height: 0;
}

/* ---- Bloc indenté ---- */
:deep(div[data-type="text-block"]) {
  border-left: 3px solid var(--color-accent);
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
  color: var(--color-muted);
  white-space: nowrap;
}

.textblock-slider-label {
  font-size: 11px;
  color: var(--color-muted);
}

.textblock-slider {
  width: 80px;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.textblock-val {
  font-size: 11px;
  color: var(--color-accent);
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
  color: var(--color-muted);
  font-size: 13px;
  padding: 12px 0;
}

.font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-input);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.font-preview {
  font-size: 16px;
  color: var(--color-tx);
  flex: 1;
}

.font-delete {
  background: none;
  border: none;
  color: var(--color-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.font-delete:hover { color: var(--color-accent); }
</style>

<style>
/* Status picker — téléporté au body, ne peut pas être scoped */
.status-picker {
  background: var(--color-card);
  border: 1px solid var(--color-border);
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
.status-picker-item:hover { background: var(--color-input); }
.status-picker-item.active { background: var(--color-input); font-weight: 600; }
.spi-icon { font-size: 13px; width: 16px; text-align: center; }
.spi-label { font-size: 12px; color: var(--color-tx); }

/* ── Panneau Rechercher / Remplacer ── */
.find-replace-panel {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 9999;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.35);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 380px;
}
.find-replace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}
.find-replace-title { font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.find-close-btn { background: none; border: none; color: var(--color-muted); font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; }
.find-close-btn:hover { color: var(--color-tx); }
.find-replace-row { display: flex; align-items: center; gap: 6px; }
.find-input {
  flex: 1;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-tx);
  font-size: 13px;
  padding: 5px 10px;
  outline: none;
  transition: border-color 0.15s;
}
.find-input:focus { border-color: var(--color-accent); }
.find-count { font-size: 11px; color: var(--color-muted); white-space: nowrap; min-width: 70px; text-align: right; }
.find-no-result { color: #e94560; }
.find-case-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 7px;
  cursor: pointer;
  transition: all 0.15s;
}
.find-case-btn.active { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }
.find-nav-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-muted);
  font-size: 14px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.find-nav-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.find-nav-btn:disabled { opacity: 0.35; cursor: default; }
.find-action-btn {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-tx);
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.find-action-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.find-action-btn:disabled { opacity: 0.35; cursor: default; }
</style>

process.noDeprecation = true
const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('./database/db')
const { autoUpdater } = require('electron-updater')
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } = require('docx')
const { parse: parseHTML } = require('node-html-parser')

let mainWindow
let db

// ---- HTML → éléments docx ----
function parseInlineNodes(node, fmt = {}) {
  const runs = []
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      // Nœud texte
      const text = child.text
      if (!text) continue
      runs.push(new TextRun({
        text,
        bold:      fmt.bold      || undefined,
        italics:   fmt.italic    || undefined,
        underline: fmt.underline ? {} : undefined,
        strike:    fmt.strike    || undefined,
        highlight: fmt.highlight ? 'yellow' : undefined,
        font:      fmt.font      || undefined,
      }))
    } else {
      const tag = child.tagName?.toLowerCase()
      const next = { ...fmt }
      if (tag === 'strong' || tag === 'b') next.bold = true
      else if (tag === 'em' || tag === 'i')  next.italic = true
      else if (tag === 'u')                  next.underline = true
      else if (tag === 's')                  next.strike = true
      else if (tag === 'mark')               next.highlight = true
      // police inline (textStyle de TipTap)
      const style = child.getAttribute?.('style') || ''
      const m = style.match(/font-family:\s*([^;]+)/)
      if (m) next.font = m[1].trim().replace(/['"]/g, '')
      runs.push(...parseInlineNodes(child, next))
    }
  }
  return runs
}

function htmlToDocxParagraphs(html) {
  if (!html) return []
  const root = parseHTML(html)
  const result = []
  for (const node of root.childNodes) {
    const tag = node.tagName?.toLowerCase()
    if (!tag) continue

    // Saut de page
    if (tag === 'div' && node.getAttribute?.('data-type') === 'page-break') {
      result.push(new Paragraph({ children: [new PageBreak()] }))
      continue
    }

    // Niveau de titre
    const headingMap = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 }
    const heading = headingMap[tag]

    // Alignement
    const style = node.getAttribute?.('style') || ''
    let alignment = AlignmentType.LEFT
    if      (style.includes('text-align: center'))  alignment = AlignmentType.CENTER
    else if (style.includes('text-align: right'))   alignment = AlignmentType.RIGHT
    else if (style.includes('text-align: justify')) alignment = AlignmentType.JUSTIFIED

    const runs = parseInlineNodes(node)
    result.push(new Paragraph({
      children: runs.length ? runs : [new TextRun('')],
      heading:   heading   || undefined,
      alignment,
    }))
  }
  return result
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    title: 'EcrisTonHistoire',
    icon: path.join(__dirname, 'build/icon.ico'),
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
  }
}

let imagesDir
let fontsDir
let backupsDir
let autoBackupTimer = null

function settingsPath() { return path.join(app.getPath('userData'), 'wf-settings.json') }
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) } catch { return {} }
}
function writeSettings(patch) {
  const s = readSettings()
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...s, ...patch }, null, 2))
}

function runAutoBackup() {
  if (!backupsDir || !db) return
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
  const name = `ecristonhistoire_auto_${stamp}.db`
  try {
    fs.copyFileSync(db.dbPath, path.join(backupsDir, name))
    writeSettings({ lastAutoBackup: now.toISOString() })
    // Garde seulement les 5 derniers backups automatiques
    const autoFiles = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('ecristonhistoire_auto_') && f.endsWith('.db'))
      .sort()
    while (autoFiles.length > 5) fs.unlinkSync(path.join(backupsDir, autoFiles.shift()))
    mainWindow?.webContents.send('autobackup:done', now.toISOString())
  } catch (e) { console.error('Auto-backup échoué :', e) }
}

function applyAutoBackup(enabled, intervalMin) {
  if (autoBackupTimer) { clearInterval(autoBackupTimer); autoBackupTimer = null }
  if (enabled && intervalMin > 0) {
    autoBackupTimer = setInterval(runAutoBackup, intervalMin * 60 * 1000)
  }
}

function getFontFamilyName(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.woff' || ext === '.woff2') return null // format compressé, skip
    const buf = fs.readFileSync(filePath)
    const numTables = buf.readUInt16BE(4)
    let nameTableOffset = -1
    for (let i = 0; i < numTables; i++) {
      const base = 12 + i * 16
      if (buf.subarray(base, base + 4).toString('ascii') === 'name') {
        nameTableOffset = buf.readUInt32BE(base + 8)
        break
      }
    }
    if (nameTableOffset < 0) return null
    const count = buf.readUInt16BE(nameTableOffset + 2)
    const stringBase = nameTableOffset + buf.readUInt16BE(nameTableOffset + 4)
    let familyName = null
    for (let i = 0; i < count; i++) {
      const rec = nameTableOffset + 6 + i * 12
      const platformID = buf.readUInt16BE(rec)
      const nameID = buf.readUInt16BE(rec + 6)
      if (nameID !== 1) continue
      const length = buf.readUInt16BE(rec + 8)
      const offset = buf.readUInt16BE(rec + 10)
      const strBuf = buf.subarray(stringBase + offset, stringBase + offset + length)
      let str = ''
      if (platformID === 3) {
        for (let j = 0; j + 1 < strBuf.length; j += 2) str += String.fromCharCode(strBuf.readUInt16BE(j))
      } else {
        str = strBuf.toString('latin1')
      }
      str = str.trim().replace(/\0/g, '')
      if (str) { familyName = str; break }
    }
    return familyName
  } catch { return null }
}

function fontToDataUrl(filename) {
  const filePath = path.join(fontsDir, filename)
  if (!fs.existsSync(filePath)) return null
  const ext = path.extname(filename).toLowerCase().slice(1)
  const mimeMap = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }
  const mime = mimeMap[ext] || 'truetype'
  const data = fs.readFileSync(filePath)
  return `data:font/${mime};base64,${data.toString('base64')}`
}

function imageToDataUrl(filename) {
  const filePath = path.join(imagesDir, filename)
  if (!fs.existsSync(filePath)) return null
  const ext = path.extname(filename).toLowerCase().slice(1)
  const mime = ['jpg', 'jpeg'].includes(ext) ? 'jpeg' : ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpeg'
  const data = fs.readFileSync(filePath)
  return `data:image/${mime};base64,${data.toString('base64')}`
}

app.whenReady().then(async () => {
  db = new Database()
  await db.init()

  imagesDir = path.join(app.getPath('userData'), 'character-images')
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })

  backupsDir = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })

  // Démarrer l'auto-backup si activé
  const s0 = readSettings()
  if (s0.autoBackupEnabled) applyAutoBackup(true, s0.autoBackupInterval ?? 60)

  ipcMain.handle('autobackup:getSettings', () => {
    const s = readSettings()
    return {
      enabled:    s.autoBackupEnabled  ?? false,
      interval:   s.autoBackupInterval ?? 60,
      lastBackup: s.lastAutoBackup     ?? null,
    }
  })

  ipcMain.handle('autobackup:set', (_, { enabled, interval }) => {
    writeSettings({ autoBackupEnabled: enabled, autoBackupInterval: interval })
    applyAutoBackup(enabled, interval)
  })

  // --- Backups ---
  ipcMain.handle('backup:create', async () => {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    const destName = `ecristonhistoire_${stamp}.db`
    const destPath = path.join(backupsDir, destName)
    fs.copyFileSync(db.dbPath, destPath)
    return { name: destName, date: now.toISOString(), size: fs.statSync(destPath).size }
  })

  ipcMain.handle('backup:list', () => {
    if (!fs.existsSync(backupsDir)) return []
    return fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.db'))
      .map(name => {
        const p = path.join(backupsDir, name)
        const stat = fs.statSync(p)
        return { name, date: stat.mtime.toISOString(), size: stat.size }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  })

  ipcMain.handle('backup:restore', async (_, name) => {
    const srcPath = path.join(backupsDir, name)
    if (!fs.existsSync(srcPath)) return false
    // Sauvegarde de sécurité avant restauration
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    fs.copyFileSync(db.dbPath, path.join(backupsDir, `ecristonhistoire_avant-restauration_${stamp}.db`))
    fs.copyFileSync(srcPath, db.dbPath)
    return true
  })

  ipcMain.handle('backup:delete', (_, name) => {
    const p = path.join(backupsDir, name)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  })

  ipcMain.handle('backup:openFolder', () => {
    require('electron').shell.openPath(backupsDir)
  })

  fontsDir = path.join(app.getPath('userData'), 'custom-fonts')
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true })

  // --- Projets ---
  ipcMain.handle('projects:getAll', () => db.getAllProjects())
  ipcMain.handle('projects:get', (_, id) => db.getProject(id))
  ipcMain.handle('projects:create', (_, name) => db.createProject(name))
  ipcMain.handle('projects:update', (_, id, data) => db.updateProject(id, data))
  ipcMain.handle('projects:wordCount', (_, id) => db.getProjectWordCount(id))
  ipcMain.handle('projects:delete', (_, id) => db.deleteProject(id))

  // --- Personnages ---
  ipcMain.handle('characters:getAll', (_, projectId) => db.getAllCharacters(projectId))
  ipcMain.handle('characters:get', (_, id) => db.getCharacter(id))
  ipcMain.handle('characters:create', (_, data) => db.createCharacter(data))
  ipcMain.handle('characters:update', (_, id, data) => db.updateCharacter(id, data))
  ipcMain.handle('characters:delete', (_, id) => db.deleteCharacter(id))

  // --- Traits ---
  ipcMain.handle('traits:getAll', (_, characterId) => db.getTraits(characterId))
  ipcMain.handle('traits:save', (_, characterId, traits) => db.saveTraits(characterId, traits))

  // --- Arcs narratifs ---
  ipcMain.handle('arcs:getAll', (_, characterId) => db.getArcs(characterId))
  ipcMain.handle('arcs:save', (_, characterId, arcs) => db.saveArcs(characterId, arcs))

  // --- Relations entre personnages ---
  ipcMain.handle('relationships:getAll', (_, projectId) => db.getRelationships(projectId))
  ipcMain.handle('relationships:save', (_, data) => db.saveRelationship(data))
  ipcMain.handle('relationships:update', (_, id, data) => db.updateRelationship(id, data))
  ipcMain.handle('relationships:delete', (_, id) => db.deleteRelationship(id))

  // --- Chapitres ---
  ipcMain.handle('chapters:getAll', (_, projectId) => db.getAllChapters(projectId))
  ipcMain.handle('chapters:get', (_, id) => db.getChapter(id))
  ipcMain.handle('chapters:create', (_, data) => db.createChapter(data))
  ipcMain.handle('chapters:update', (_, id, data) => {
    const old = data.word_count !== undefined ? db.getChapter(id) : null
    const result = db.updateChapter(id, data)
    if (old && data.word_count !== undefined) {
      const delta = data.word_count - (old.word_count || 0)
      if (delta > 0) db.recordWords(result.project_id, delta, new Date().toISOString().split('T')[0])
    }
    return result
  })
  ipcMain.handle('chapters:delete', (_, id) => db.deleteChapter(id))

  // --- Statistiques ---
  ipcMain.handle('stats:getSummary', () => db.getSummary())
  ipcMain.handle('stats:getHistory', (_, days) => db.getHistory(days))
  ipcMain.handle('stats:getGoals',   () => db.getGoals())
  ipcMain.handle('stats:setGoal',    (_, type, target) => db.setGoal(type, target))
  ipcMain.handle('stats:deleteGoal', (_, type) => db.deleteGoal(type))

  // --- Chronologie ---
  ipcMain.handle('timeline:getAll', (_, projectId) => db.getAllEvents(projectId))
  ipcMain.handle('timeline:create', (_, data) => db.createEvent(data))
  ipcMain.handle('timeline:update', (_, id, data) => db.updateEvent(id, data))
  ipcMain.handle('timeline:delete', (_, id) => db.deleteEvent(id))

  // --- Polices personnalisées ---
  ipcMain.handle('fonts:getAll', () => {
    return db.getFonts().map(f => ({ ...f, dataUrl: fontToDataUrl(f.filename) }))
  })

  ipcMain.handle('fonts:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Polices', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
    })
    if (result.canceled || !result.filePaths.length) return null
    const src = result.filePaths[0]
    const ext = path.extname(src)
    const extractedName = getFontFamilyName(src)
    const baseName = extractedName || path.basename(src, ext).replace(/[-_]/g, ' ')
    const destFilename = `font_${Date.now()}${ext}`
    fs.copyFileSync(src, path.join(fontsDir, destFilename))
    const font = db.addFont(baseName, destFilename)
    return { ...font, dataUrl: fontToDataUrl(destFilename) }
  })

  ipcMain.handle('fonts:delete', (_, id) => {
    const font = db.getFontById(id)
    if (!font) return
    const filePath = path.join(fontsDir, font.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    db.deleteFont(id)
  })

  // --- Liminaires ---
  ipcMain.handle('liminaires:get', (_, projectId, type) => db.getLiminaire(projectId, type))
  ipcMain.handle('liminaires:save', (_, projectId, type, data) => db.saveLiminaire(projectId, type, data))

  // --- Recherche dans les chapitres ---
  ipcMain.handle('chapters:search', (_, projectId, query) => {
    if (!query || query.trim().length < 2) return []
    const results = db.searchChapters(projectId, query.trim())
    return results.map(ch => {
      const text = ch.content.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
      const lower = text.toLowerCase()
      const q = query.toLowerCase()
      const occurrences = []
      let pos = 0
      while ((pos = lower.indexOf(q, pos)) !== -1) {
        const start = Math.max(0, pos - 70)
        const end = Math.min(text.length, pos + q.length + 70)
        occurrences.push(
          (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
        )
        pos += q.length
        if (occurrences.length >= 3) break
      }
      return { id: ch.id, title: ch.title, part: ch.part, occurrences, count: occurrences.length }
    })
  })

  // --- Images personnages ---
  ipcMain.handle('images:getAll', (_, characterId) => {
    return db.getImages(characterId).map(img => ({ ...img, dataUrl: imageToDataUrl(img.filename) }))
  })

  ipcMain.handle('images:pick', async (_, characterId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (result.canceled || !result.filePaths.length) return null
    const src = result.filePaths[0]
    const ext = path.extname(src)
    const filename = `char_${characterId}_${Date.now()}${ext}`
    fs.copyFileSync(src, path.join(imagesDir, filename))
    const position = db.getImages(characterId).length
    const img = db.addImage(characterId, filename, position)
    return { ...img, dataUrl: imageToDataUrl(filename) }
  })

  ipcMain.handle('images:delete', (_, id) => {
    const img = db.getImageById(id)
    if (!img) return
    const filePath = path.join(imagesDir, img.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    db.deleteImage(id)
  })

  // --- Liens inspiration personnages ---
  ipcMain.handle('links:getAll', (_, characterId) => db.getLinks(characterId))
  ipcMain.handle('links:add', (_, characterId, url, label) => db.addLink(characterId, url, label))
  ipcMain.handle('links:delete', (_, id) => db.deleteLink(id))
  ipcMain.handle('links:open', (_, url) => require('electron').shell.openExternal(url))

  // --- Image éditeur (insertion dans le contenu) ---
  ipcMain.handle('editor:pickImage', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    })
    if (result.canceled || !result.filePaths.length) return null
    const src = result.filePaths[0]
    const ext = path.extname(src).toLowerCase().slice(1)
    const mime = ['jpg', 'jpeg'].includes(ext) ? 'jpeg' : ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : ext === 'gif' ? 'gif' : 'jpeg'
    return `data:image/${mime};base64,${fs.readFileSync(src).toString('base64')}`
  })

  // --- Export Word ---
  ipcMain.handle('export:word', async (_, projectId) => {
    const project = db.getProject(projectId)
    if (!project) return false

    const chapters = db.getAllChapters(projectId)
    const children = []

    // Titre du projet
    children.push(new Paragraph({
      text: project.name || 'Sans titre',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }))
    children.push(new Paragraph({ text: '' }))

    for (let i = 0; i < chapters.length; i++) {
      const ch = db.getChapter(chapters[i].id)

      // Saut de page avant chaque chapitre (sauf le premier)
      if (i > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }))
      }

      // En-tête de partie si défini
      if (ch.part) {
        children.push(new Paragraph({
          text: ch.part,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
        }))
      }

      // Titre du chapitre
      children.push(new Paragraph({
        text: ch.title || 'Sans titre',
        heading: HeadingLevel.HEADING_1,
      }))

      // Contenu HTML → paragraphes Word
      const paras = htmlToDocxParagraphs(ch.content || '')
      children.push(...paras)
    }

    const doc = new Document({
      creator: 'Ecris Ton Histoire',
      title: project.name || 'Export',
      sections: [{ children }],
    })

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter en Word',
      defaultPath: `${(project.name || 'export').replace(/[<>:"/\\|?*]/g, '_')}.docx`,
      filters: [{ name: 'Document Word', extensions: ['docx'] }],
    })
    if (canceled || !filePath) return false

    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(filePath, buffer)
    return true
  })

  createWindow()

  // Correcteur orthographique en français
  mainWindow.webContents.session.setSpellCheckerLanguages(['fr-FR', 'fr'])

  // Menu contextuel : suggestions orthographiques + copier/coller
  mainWindow.webContents.on('context-menu', (_, params) => {
    const menu = new Menu()

    if (params.dictionarySuggestions?.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        }))
      }
      menu.append(new MenuItem({ type: 'separator' }))
    }

    if (params.misspelledWord) {
      menu.append(new MenuItem({
        label: 'Ajouter au dictionnaire',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Couper', role: 'cut' }))
      menu.append(new MenuItem({ label: 'Copier', role: 'copy' }))
      menu.append(new MenuItem({ label: 'Coller', role: 'paste' }))
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copier', role: 'copy' }))
    }

    if (menu.items.length > 0) menu.popup()
  })

  // Vérification de mise à jour (electron-updater)
  mainWindow.webContents.once('did-finish-load', () => {
    if (process.env.NODE_ENV !== 'development') autoUpdater.checkForUpdates()
  })

  // Intercepter la fermeture : demander au renderer de sauvegarder d'abord
  let readyToClose = false
  mainWindow.on('close', (e) => {
    if (!readyToClose) {
      e.preventDefault()
      mainWindow.webContents.send('app:request-save')
    }
  })

  ipcMain.handle('app:save-complete', () => {
    readyToClose = true
    mainWindow.close()
  })
})

// ---- electron-updater ----
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('app:update-available', info.version)
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('app:update-progress', Math.round(progress.percent))
})

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('app:update-downloaded')
})

ipcMain.on('app:install-update', () => {
  autoUpdater.quitAndInstall()
})

app.on('window-all-closed', () => {
  if (db) db.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

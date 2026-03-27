const { contextBridge, ipcRenderer } = require('electron')

// Expose des APIs sécurisées au renderer (front-end)
contextBridge.exposeInMainWorld('api', {
  // Projets
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    get: (id) => ipcRenderer.invoke('projects:get', id),
    create: (name) => ipcRenderer.invoke('projects:create', name),
    update: (id, data) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id) => ipcRenderer.invoke('projects:delete', id),
    wordCount: (id) => ipcRenderer.invoke('projects:wordCount', id),
  },

  // Personnages
  characters: {
    getAll: (projectId) => ipcRenderer.invoke('characters:getAll', projectId),
    get: (id) => ipcRenderer.invoke('characters:get', id),
    create: (data) => ipcRenderer.invoke('characters:create', data),
    update: (id, data) => ipcRenderer.invoke('characters:update', id, data),
    delete: (id) => ipcRenderer.invoke('characters:delete', id),
  },

  // Traits de personnalité
  traits: {
    getAll: (characterId) => ipcRenderer.invoke('traits:getAll', characterId),
    save: (characterId, traits) => ipcRenderer.invoke('traits:save', characterId, traits),
  },

  // Arcs narratifs
  arcs: {
    getAll: (characterId) => ipcRenderer.invoke('arcs:getAll', characterId),
    save: (characterId, arcs) => ipcRenderer.invoke('arcs:save', characterId, arcs),
  },

  // Relations
  relationships: {
    getAll: (projectId) => ipcRenderer.invoke('relationships:getAll', projectId),
    save: (data) => ipcRenderer.invoke('relationships:save', data),
    update: (id, data) => ipcRenderer.invoke('relationships:update', id, data),
    delete: (id) => ipcRenderer.invoke('relationships:delete', id),
  },

  // Chapitres
  chapters: {
    getAll: (projectId) => ipcRenderer.invoke('chapters:getAll', projectId),
    get: (id) => ipcRenderer.invoke('chapters:get', id),
    create: (data) => ipcRenderer.invoke('chapters:create', data),
    update: (id, data) => ipcRenderer.invoke('chapters:update', id, data),
    delete: (id) => ipcRenderer.invoke('chapters:delete', id),
    search: (projectId, query) => ipcRenderer.invoke('chapters:search', projectId, query),
  },

  // Liminaires
  liminaires: {
    get: (projectId, type) => ipcRenderer.invoke('liminaires:get', projectId, type),
    save: (projectId, type, data) => ipcRenderer.invoke('liminaires:save', projectId, type, data),
  },

  // Polices personnalisées
  customFonts: {
    getAll: () => ipcRenderer.invoke('fonts:getAll'),
    pick: () => ipcRenderer.invoke('fonts:pick'),
    delete: (id) => ipcRenderer.invoke('fonts:delete', id),
  },

  // Images personnages
  characterImages: {
    getAll: (characterId) => ipcRenderer.invoke('images:getAll', characterId),
    pick: (characterId) => ipcRenderer.invoke('images:pick', characterId),
    delete: (id) => ipcRenderer.invoke('images:delete', id),
  },

  // Liens inspiration personnages
  characterLinks: {
    getAll: (characterId) => ipcRenderer.invoke('links:getAll', characterId),
    add: (characterId, url, label) => ipcRenderer.invoke('links:add', characterId, url, label),
    delete: (id) => ipcRenderer.invoke('links:delete', id),
    open: (url) => ipcRenderer.invoke('links:open', url),
  },

  // Cycle de vie app
  app: {
    onRequestSave:    (cb) => ipcRenderer.on('app:request-save', cb),
    saveComplete:     ()   => ipcRenderer.invoke('app:save-complete'),
    onUpdateAvailable:(cb) => ipcRenderer.on('app:update-available', (_, version, url) => cb(version, url)),
  },

  // Auto-backup
  autobackup: {
    getSettings: ()     => ipcRenderer.invoke('autobackup:getSettings'),
    set:         (data) => ipcRenderer.invoke('autobackup:set', data),
    onDone:      (cb)   => ipcRenderer.on('autobackup:done', (_, date) => cb(date)),
  },

  // Export
  export: {
    word: (projectId) => ipcRenderer.invoke('export:word', projectId),
  },

  // Backups
  backup: {
    create:     ()     => ipcRenderer.invoke('backup:create'),
    list:       ()     => ipcRenderer.invoke('backup:list'),
    restore:    (name) => ipcRenderer.invoke('backup:restore', name),
    delete:     (name) => ipcRenderer.invoke('backup:delete', name),
    openFolder: ()     => ipcRenderer.invoke('backup:openFolder'),
  },

  // Éditeur
  editor: {
    pickImage: () => ipcRenderer.invoke('editor:pickImage'),
  },

  // Statistiques d'écriture
  stats: {
    getSummary: ()             => ipcRenderer.invoke('stats:getSummary'),
    getHistory: (days)         => ipcRenderer.invoke('stats:getHistory', days),
    getGoals:   ()             => ipcRenderer.invoke('stats:getGoals'),
    setGoal:    (type, target) => ipcRenderer.invoke('stats:setGoal', type, target),
    deleteGoal: (type)         => ipcRenderer.invoke('stats:deleteGoal', type),
  },

  // Chronologie
  timeline: {
    getAll: (projectId) => ipcRenderer.invoke('timeline:getAll', projectId),
    create: (data) => ipcRenderer.invoke('timeline:create', data),
    update: (id, data) => ipcRenderer.invoke('timeline:update', id, data),
    delete: (id) => ipcRenderer.invoke('timeline:delete', id),
  },
})

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

class DB {
  constructor() {
    this.db = null
    this.dbPath = path.join(app.getPath('userData'), 'ecristonhistoire.db')
  }

  async init() {
    const initSqlJs = require('sql.js')
    const SQL = await initSqlJs()

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(fileBuffer)
    } else {
      this.db = new SQL.Database()
    }

    this.SQL = SQL  // conservé pour usage dans _migrate()
    this.db.run('PRAGMA foreign_keys = ON')
    this._createSchema()
    this._migrate()
    this._save()
  }

  _save() {
    const data = this.db.export()
    fs.writeFileSync(this.dbPath, Buffer.from(data))
  }

  _createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        synopsis    TEXT,
        stage       TEXT DEFAULT 'idee',
        word_count  INTEGER DEFAULT 0,
        books_count INTEGER DEFAULT 1,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS characters (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        role         TEXT DEFAULT 'secondaire',
        origin       TEXT DEFAULT 'Autre',
        importance   INTEGER DEFAULT 0,
        age          TEXT,
        gender       TEXT,
        appearance   TEXT,
        background   TEXT,
        motivation   TEXT,
        fears        TEXT,
        secrets      TEXT,
        notes        TEXT,
        created_at   TEXT DEFAULT (datetime('now')),
        updated_at   TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS character_traits (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        trait        TEXT NOT NULL,
        type         TEXT DEFAULT 'neutre'
      );

      CREATE TABLE IF NOT EXISTS character_arcs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        description  TEXT,
        phase        TEXT DEFAULT 'debut',
        position     INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS character_relationships (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        character_a_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        character_b_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        relation_type  TEXT NOT NULL,
        description    TEXT
      );

      CREATE TABLE IF NOT EXISTS timeline_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        date       INTEGER NOT NULL,
        type       TEXT NOT NULL,
        desc       TEXT NOT NULL,
        chars      TEXT,
        lieu       TEXT
      );

      CREATE TABLE IF NOT EXISTS liminaires (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        content    TEXT DEFAULT '',
        word_count INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id, type)
      );

      CREATE TABLE IF NOT EXISTS custom_fonts (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT NOT NULL,
        filename TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS character_images (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        filename     TEXT NOT NULL,
        position     INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS character_links (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        url          TEXT NOT NULL,
        label        TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title      TEXT NOT NULL DEFAULT 'Nouveau chapitre',
        part       TEXT,
        content    TEXT DEFAULT '',
        word_count INTEGER DEFAULT 0,
        position   INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS writing_sessions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        date       TEXT NOT NULL,
        words_added INTEGER NOT NULL DEFAULT 0,
        UNIQUE(project_id, date)
      );

      CREATE TABLE IF NOT EXISTS writing_goals (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        type   TEXT NOT NULL UNIQUE,
        target INTEGER NOT NULL
      );
    `)
  }

  // Convertit le résultat sql.js en tableau d'objets
  _toObjects(result) {
    if (!result || result.length === 0) return []
    const { columns, values } = result[0]
    return values.map(row => {
      const obj = {}
      columns.forEach((col, i) => { obj[col] = row[i] })
      return obj
    })
  }

  _query(sql, params = []) {
    return this._toObjects(this.db.exec(sql, params))
  }

  _run(sql, params = []) {
    this.db.run(sql, params)
    this._save()
    return this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0]
  }

  // Migration : ajoute les colonnes si elles n'existent pas encore (DB existante)
  _migrate() {
    const projCols = this._query(`PRAGMA table_info(projects)`).map(r => r.name)
    for (const [col, def] of [
      ['synopsis',    'TEXT'],
      ['stage',       "TEXT DEFAULT 'idee'"],
      ['word_count',  'INTEGER DEFAULT 0'],
      ['books_count', 'INTEGER DEFAULT 1'],
      ['notes',       'TEXT'],
    ]) {
      if (!projCols.includes(col)) this.db.run(`ALTER TABLE projects ADD COLUMN ${col} ${def}`)
    }

    const charCols = this._query(`PRAGMA table_info(characters)`).map(r => r.name)
    for (const [col, def] of [
      ['origin',           "TEXT DEFAULT 'Autre'"],
      ['importance',       'INTEGER DEFAULT 0'],
      ['name_translation', 'TEXT'],
      ['home',             'TEXT'],
      ['social_level',     'TEXT'],
      ['likes',            'TEXT'],
      ['dislikes',         'TEXT'],
      ['clothing',         'TEXT'],
    ]) {
      if (!charCols.includes(col)) this.db.run(`ALTER TABLE characters ADD COLUMN ${col} ${def}`)
    }

    // Ajouter project_id à timeline_events si absent (anciennes DB)
    const tlCols = this._query(`PRAGMA table_info(timeline_events)`).map(r => r.name)
    if (!tlCols.includes('project_id')) {
      this.db.run(`ALTER TABLE timeline_events ADD COLUMN project_id INTEGER REFERENCES projects(id)`)
      this.db.run(`UPDATE timeline_events SET project_id = (SELECT id FROM projects ORDER BY id ASC LIMIT 1) WHERE project_id IS NULL`)
    }

    // Corriger les timeline_events dont le project_id n'existe plus dans projects
    // (peut arriver après une restauration de backup qui réassigne les IDs)
    this.db.run(`
      UPDATE timeline_events
      SET project_id = (SELECT id FROM projects ORDER BY id DESC LIMIT 1)
      WHERE project_id NOT IN (SELECT id FROM projects)
        AND (SELECT COUNT(*) FROM projects) > 0
    `)

    // Ajouter status aux chapitres si absent
    const chapCols = this._query(`PRAGMA table_info(chapters)`).map(r => r.name)
    if (!chapCols.includes('status')) {
      this.db.run(`ALTER TABLE chapters ADD COLUMN status TEXT DEFAULT NULL`)
    }

    // Fix ponctuel : chapitre 39 (id=40) corrompu (contenu identique au chapitre 38)
    const ch38row = this._query(`SELECT content FROM chapters WHERE id = 39`)[0]
    const ch39row = this._query(`SELECT content FROM chapters WHERE id = 40`)[0]
    if (ch38row && ch39row && ch38row.content && ch38row.content === ch39row.content) {
      const backupDir = path.join(path.dirname(this.dbPath), 'backups')
      const candidates = [
        'ecristonhistoire_auto_2026-04-06_12-46.db',
        'ecristonhistoire_auto_2026-04-05_17-10.db',
        'ecristonhistoire_auto_2026-04-04_23-15.db',
      ]
      for (const name of candidates) {
        const bPath = path.join(backupDir, name)
        if (!fs.existsSync(bPath)) continue
        try {
          const bBuf = fs.readFileSync(bPath)
          const bDb = new this.SQL.Database(bBuf)
          const bRes = bDb.exec(`SELECT content FROM chapters WHERE id = 40`)
          bDb.close()
          if (!bRes.length) continue
          const goodContent = bRes[0].values[0][0]
          if (!goodContent || goodContent === ch38row.content) continue
          // Corriger aussi la lettrine si elle est sur un <br>
          const fixed = goodContent.replace(/<span([^>]*data-drop-cap[^>]*)><br><\/span>(L)/g, '<span$1>L</span>')
          this.db.run(`UPDATE chapters SET content = ? WHERE id = 40`, [fixed])
          break
        } catch (e) { /* backup illisible, essayer le suivant */ }
      }
    }
  }

  // ---- Projets ----

  getAllProjects() {
    return this._query(`SELECT * FROM projects ORDER BY updated_at DESC`)
  }

  getProject(id) {
    return this._query(`SELECT * FROM projects WHERE id = ?`, [id])[0] || null
  }

  createProject(name) {
    const id = this._run(`INSERT INTO projects (name) VALUES (?)`, [name])
    return this.getProject(id)
  }

  updateProject(id, data) {
    const fields = ['name', 'synopsis', 'stage', 'word_count', 'books_count', 'notes']
    const toUpdate = fields.filter(f => data[f] !== undefined)
    if (toUpdate.length === 0) return this.getProject(id)
    const sets = toUpdate.map(f => `${f} = ?`).join(', ')
    const values = toUpdate.map(f => data[f])
    this._run(
      `UPDATE projects SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
      [...values, id]
    )
    return this.getProject(id)
  }

  deleteProject(id) {
    this._run(`DELETE FROM projects WHERE id = ?`, [id])
  }

  // ---- Personnages ----

  getAllCharacters(projectId) {
    return this._query(`SELECT * FROM characters WHERE project_id = ? ORDER BY name`, [projectId])
  }

  getCharacter(id) {
    return this._query(`SELECT * FROM characters WHERE id = ?`, [id])[0] || null
  }

  createCharacter(data) {
    const { project_id, name, role = 'secondaire', origin = 'Autre' } = data
    const id = this._run(
      `INSERT INTO characters (project_id, name, role, origin) VALUES (?, ?, ?, ?)`,
      [project_id, name, role, origin]
    )
    return this.getCharacter(id)
  }

  updateCharacter(id, data) {
    const fields = ['name', 'name_translation', 'role', 'origin', 'importance', 'age', 'gender', 'appearance', 'clothing', 'background', 'motivation', 'fears', 'likes', 'dislikes', 'secrets', 'notes', 'home', 'social_level']
    const toUpdate = fields.filter(f => data[f] !== undefined)
    if (toUpdate.length === 0) return this.getCharacter(id)

    const sets = toUpdate.map(f => `${f} = ?`).join(', ')
    const values = toUpdate.map(f => data[f])
    this._run(
      `UPDATE characters SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
      [...values, id]
    )
    return this.getCharacter(id)
  }

  deleteCharacter(id) {
    this._run(`DELETE FROM characters WHERE id = ?`, [id])
  }

  // ---- Traits ----

  getTraits(characterId) {
    return this._query(`SELECT * FROM character_traits WHERE character_id = ?`, [characterId])
  }

  saveTraits(characterId, traits) {
    this.db.run(`DELETE FROM character_traits WHERE character_id = ?`, [characterId])
    for (const t of traits) {
      this.db.run(
        `INSERT INTO character_traits (character_id, trait, type) VALUES (?, ?, ?)`,
        [characterId, t.trait, t.type || 'neutre']
      )
    }
    this._save()
    return this.getTraits(characterId)
  }

  // ---- Arcs narratifs ----

  getArcs(characterId) {
    return this._query(
      `SELECT * FROM character_arcs WHERE character_id = ? ORDER BY position`,
      [characterId]
    )
  }

  saveArcs(characterId, arcs) {
    this.db.run(`DELETE FROM character_arcs WHERE character_id = ?`, [characterId])
    arcs.forEach((arc, i) => {
      this.db.run(
        `INSERT INTO character_arcs (character_id, title, description, phase, position) VALUES (?, ?, ?, ?, ?)`,
        [characterId, arc.title, arc.description || '', arc.phase || 'debut', i]
      )
    })
    this._save()
    return this.getArcs(characterId)
  }

  // ---- Relations ----

  getRelationships(projectId) {
    return this._query(`
      SELECT r.*, a.name AS character_a_name, b.name AS character_b_name
      FROM character_relationships r
      JOIN characters a ON a.id = r.character_a_id
      JOIN characters b ON b.id = r.character_b_id
      WHERE r.project_id = ?
    `, [projectId])
  }

  saveRelationship(data) {
    const { project_id, character_a_id, character_b_id, relation_type, description } = data
    const existing = this._query(`
      SELECT id FROM character_relationships
      WHERE (character_a_id = ? AND character_b_id = ?)
         OR (character_a_id = ? AND character_b_id = ?)
    `, [character_a_id, character_b_id, character_b_id, character_a_id])[0]

    if (existing) {
      this._run(
        `UPDATE character_relationships SET relation_type = ?, description = ? WHERE id = ?`,
        [relation_type, description || '', existing.id]
      )
    } else {
      this._run(
        `INSERT INTO character_relationships (project_id, character_a_id, character_b_id, relation_type, description) VALUES (?, ?, ?, ?, ?)`,
        [project_id, character_a_id, character_b_id, relation_type, description || '']
      )
    }
  }

  updateRelationship(id, { relation_type, description }) {
    this._run(
      `UPDATE character_relationships SET relation_type = ?, description = ? WHERE id = ?`,
      [relation_type, description || '', id]
    )
    this._save()
  }

  deleteRelationship(id) {
    this._run(`DELETE FROM character_relationships WHERE id = ?`, [id])
  }

  // ---- Chronologie ----

  getAllEvents(projectId) {
    return this._query(`SELECT * FROM timeline_events WHERE project_id = ? ORDER BY date ASC`, [projectId])
  }

  createEvent(data) {
    const { project_id, date, type, desc, chars = '', lieu = '' } = data
    const id = this._run(
      `INSERT INTO timeline_events (project_id, date, type, desc, chars, lieu) VALUES (?, ?, ?, ?, ?, ?)`,
      [project_id, date, type, desc, chars, lieu]
    )
    return this._query(`SELECT * FROM timeline_events WHERE id = ?`, [id])[0] || null
  }

  updateEvent(id, data) {
    const fields = ['date', 'type', 'desc', 'chars', 'lieu']
    const toUpdate = fields.filter(f => data[f] !== undefined)
    if (toUpdate.length === 0) return
    const sets = toUpdate.map(f => `${f} = ?`).join(', ')
    const values = toUpdate.map(f => data[f])
    this._run(`UPDATE timeline_events SET ${sets} WHERE id = ?`, [...values, id])
  }

  deleteEvent(id) {
    this._run(`DELETE FROM timeline_events WHERE id = ?`, [id])
  }

  // ---- Polices personnalisées ----

  getFonts() {
    return this._query(`SELECT * FROM custom_fonts ORDER BY name ASC`)
  }

  getFontById(id) {
    return this._query(`SELECT * FROM custom_fonts WHERE id = ?`, [id])[0] || null
  }

  addFont(name, filename) {
    const id = this._run(`INSERT INTO custom_fonts (name, filename) VALUES (?, ?)`, [name, filename])
    return this.getFontById(id)
  }

  deleteFont(id) {
    this._run(`DELETE FROM custom_fonts WHERE id = ?`, [id])
  }

  // ---- Liminaires ----

  getLiminaire(projectId, type) {
    return this._query(`SELECT * FROM liminaires WHERE project_id = ? AND type = ?`, [projectId, type])[0] || null
  }

  saveLiminaire(projectId, type, data) {
    const existing = this.getLiminaire(projectId, type)
    if (existing) {
      const fields = ['content', 'word_count'].filter(f => data[f] !== undefined)
      if (fields.length) {
        const sets = fields.map(f => `${f} = ?`).join(', ')
        this._run(
          `UPDATE liminaires SET ${sets}, updated_at = datetime('now') WHERE project_id = ? AND type = ?`,
          [...fields.map(f => data[f]), projectId, type]
        )
      }
    } else {
      this._run(
        `INSERT INTO liminaires (project_id, type, content, word_count) VALUES (?, ?, ?, ?)`,
        [projectId, type, data.content || '', data.word_count || 0]
      )
    }
    return this.getLiminaire(projectId, type)
  }

  searchChapters(projectId, query) {
    return this._query(
      `SELECT id, title, part, content FROM chapters WHERE project_id = ? AND content LIKE ? ORDER BY position ASC, id ASC`,
      [projectId, `%${query}%`]
    )
  }

  // ---- Images personnages ----

  getImages(characterId) {
    return this._query(`SELECT * FROM character_images WHERE character_id = ? ORDER BY position ASC`, [characterId])
  }

  getImageById(id) {
    return this._query(`SELECT * FROM character_images WHERE id = ?`, [id])[0] || null
  }

  addImage(characterId, filename, position) {
    const id = this._run(
      `INSERT INTO character_images (character_id, filename, position) VALUES (?, ?, ?)`,
      [characterId, filename, position]
    )
    return this.getImageById(id)
  }

  deleteImage(id) {
    this._run(`DELETE FROM character_images WHERE id = ?`, [id])
  }

  // ---- Liens inspiration personnages ----

  getLinks(characterId) {
    return this._query(`SELECT * FROM character_links WHERE character_id = ? ORDER BY id ASC`, [characterId])
  }

  addLink(characterId, url, label) {
    const id = this._run(
      `INSERT INTO character_links (character_id, url, label) VALUES (?, ?, ?)`,
      [characterId, url, label || '']
    )
    return this._query(`SELECT * FROM character_links WHERE id = ?`, [id])[0]
  }

  deleteLink(id) {
    this._run(`DELETE FROM character_links WHERE id = ?`, [id])
  }

  // ---- Chapitres ----

  getAllChapters(projectId) {
    return this._query(`SELECT id, project_id, title, part, word_count, status, position, created_at, updated_at FROM chapters WHERE project_id = ? ORDER BY position ASC, id ASC`, [projectId])
  }

  getChapter(id) {
    return this._query(`SELECT * FROM chapters WHERE id = ?`, [id])[0] || null
  }

  createChapter(data) {
    const { project_id, title = 'Nouveau chapitre', part = null } = data
    const maxPos = this._query(`SELECT COALESCE(MAX(position),0) as m FROM chapters WHERE project_id = ?`, [project_id])[0]?.m ?? 0
    const id = this._run(
      `INSERT INTO chapters (project_id, title, part, position) VALUES (?, ?, ?, ?)`,
      [project_id, title, part, maxPos + 1]
    )
    return this.getChapter(id)
  }

  updateChapter(id, data) {
    const fields = ['title', 'part', 'content', 'word_count', 'status', 'position']
    const toUpdate = fields.filter(f => data[f] !== undefined)
    if (toUpdate.length === 0) return this.getChapter(id)
    const sets = toUpdate.map(f => `${f} = ?`).join(', ')
    const values = toUpdate.map(f => data[f])
    this._run(`UPDATE chapters SET ${sets}, updated_at = datetime('now') WHERE id = ?`, [...values, id])
    return this.getChapter(id)
  }

  deleteChapter(id) {
    this._run(`DELETE FROM chapters WHERE id = ?`, [id])
  }

  reorderChapters(orders) {
    // orders = [{ id, position }, ...]
    for (const { id, position } of orders) {
      this._run(`UPDATE chapters SET position = ? WHERE id = ?`, [position, id])
    }
  }

  insertChapterAt(data) {
    // Insère un chapitre à une position donnée en décalant les suivants
    const { project_id, title, part, position } = data
    this._run(
      `UPDATE chapters SET position = position + 1 WHERE project_id = ? AND position >= ?`,
      [project_id, position]
    )
    const id = this._run(
      `INSERT INTO chapters (project_id, title, part, position) VALUES (?, ?, ?, ?)`,
      [project_id, title, part ?? null, position]
    )
    return this.getChapter(id)
  }

  // ---- Statistiques d'écriture ----

  recordWords(projectId, delta, date) {
    this.db.run(`
      INSERT INTO writing_sessions (project_id, date, words_added) VALUES (?, ?, ?)
      ON CONFLICT(project_id, date) DO UPDATE SET words_added = words_added + excluded.words_added
    `, [projectId, date, delta])
    this._save()
  }

  getHistory(days = 30) {
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().split('T')[0]
    return this._query(`
      SELECT s.date, SUM(s.words_added) as total, s.project_id, p.name as project_name
      FROM writing_sessions s
      JOIN projects p ON p.id = s.project_id
      WHERE s.date >= ?
      GROUP BY s.date, s.project_id
      ORDER BY s.date ASC
    `, [since])
  }

  getSummary() {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
    const monday = new Date(now); monday.setDate(now.getDate() + diff)
    const weekStart = monday.toISOString().split('T')[0]
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return {
      today:  this._query(`SELECT COALESCE(SUM(words_added),0) as t FROM writing_sessions WHERE date = ?`, [today])[0]?.t ?? 0,
      week:   this._query(`SELECT COALESCE(SUM(words_added),0) as t FROM writing_sessions WHERE date >= ?`, [weekStart])[0]?.t ?? 0,
      month:  this._query(`SELECT COALESCE(SUM(words_added),0) as t FROM writing_sessions WHERE date >= ?`, [monthStart])[0]?.t ?? 0,
    }
  }

  getGoals() {
    return this._query(`SELECT * FROM writing_goals`)
  }

  setGoal(type, target) {
    this.db.run(`INSERT INTO writing_goals (type, target) VALUES (?, ?) ON CONFLICT(type) DO UPDATE SET target = excluded.target`, [type, target])
    this._save()
  }

  deleteGoal(type) {
    this._run(`DELETE FROM writing_goals WHERE type = ?`, [type])
  }

  getProjectWordCount(projectId) {
    const rows = this._query(
      `SELECT COALESCE(SUM(word_count), 0) AS total FROM chapters WHERE project_id = ?`,
      [projectId]
    )
    return rows[0]?.total ?? 0
  }

  close() {
    if (this.db) {
      this._save()
      this.db.close()
    }
  }
}

module.exports = DB

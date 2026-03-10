import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database('library.db');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    doc_id TEXT NOT NULL UNIQUE,
    title TEXT,
    authors TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS doc_tags (
    doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (doc_id, tag_id)
  )
`);


app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function fetchDocInfo(docId) {
  let title = null;
  let authors = null;

  try {
    const res = await fetch(`https://docs.google.com/document/d/${docId}/preview`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) title = m[1].replace(/ - Google (Docs|Drive|Документы)$/, '').trim();
    }
  } catch (_) {}

  try {
    const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const text = await res.text();
      const nonEmptyLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (!title && nonEmptyLines[0]) title = nonEmptyLines[0];
      if (nonEmptyLines[1]) authors = nonEmptyLines[1];
    }
  } catch (_) {}

  return { title: title || 'Untitled', authors };
}

const getDocTags = db.prepare(`
  SELECT t.name FROM tags t
  JOIN doc_tags dt ON dt.tag_id = t.id
  WHERE dt.doc_id = ?
  ORDER BY t.name
`);

function docWithTags(doc) {
  return {
    ...doc,
    tags: getDocTags.all(doc.id).map(r => r.name),
  };
}

app.post('/api/docs', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const docId = extractDocId(url);
  if (!docId) return res.status(400).json({ error: 'Invalid Google Docs URL' });

  const { title, authors } = await fetchDocInfo(docId);

  try {
    const stmt = db.prepare(`
      INSERT INTO docs (url, doc_id, title, authors) VALUES (?, ?, ?, ?)
      ON CONFLICT(doc_id) DO UPDATE SET url=excluded.url, title=excluded.title, authors=excluded.authors
    `);
    const result = stmt.run(url, docId, title, authors);
    const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(result.lastInsertRowid)
      ?? db.prepare('SELECT * FROM docs WHERE doc_id = ?').get(docId);
    res.json(docWithTags(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/docs', (_req, res) => {
  const docs = db.prepare('SELECT * FROM docs ORDER BY created_at DESC').all();
  res.json(docs.map(docWithTags));
});

app.patch('/api/docs/:id/title', (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  db.prepare('UPDATE docs SET title = ? WHERE id = ?').run(title.trim(), req.params.id);
  res.json({ title: title.trim() });
});

app.patch('/api/docs/:id/tags', (req, res) => {
  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

  const unique = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  const docId = Number(req.params.id);

  const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
  const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
  const clearDocTags = db.prepare(`DELETE FROM doc_tags WHERE doc_id = ?`);
  const insertDocTag = db.prepare(`INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)`);

  db.transaction(() => {
    clearDocTags.run(docId);
    for (const name of unique) {
      insertTag.run(name);
      const tag = getTag.get(name);
      insertDocTag.run(docId, tag.id);
    }
  })();

  res.json({ tags: getDocTags.all(docId).map(r => r.name) });
});

app.post('/api/docs/import', (req, res) => {
  const { docs } = req.body;
  if (!Array.isArray(docs)) return res.status(400).json({ error: 'docs must be an array' });

  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO docs (url, doc_id, title, authors, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
  const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
  const clearDocTags = db.prepare(`DELETE FROM doc_tags WHERE doc_id = ?`);
  const insertDocTag = db.prepare(`INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)`);
  const getDoc = db.prepare(`SELECT id FROM docs WHERE doc_id = ?`);

  let imported = 0;
  db.transaction(() => {
    for (const d of docs) {
      if (!d.url || !d.doc_id) continue;
      const { changes } = insertDoc.run(
        d.url, d.doc_id, d.title || 'Untitled',
        d.authors || null, d.created_at || new Date().toISOString()
      );
      if (!changes) continue; // doc already existed, skip entirely
      const row = getDoc.get(d.doc_id);
      if (!row) continue;
      for (const name of (d.tags || [])) {
        insertTag.run(name);
        const tag = getTag.get(name);
        insertDocTag.run(row.id, tag.id);
      }
      imported++;
    }
  })();

  res.json({ imported });
});

app.delete('/api/docs/:id', (req, res) => {
  db.prepare('DELETE FROM docs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(3000, () => console.log('RFC Library → http://localhost:3000'));

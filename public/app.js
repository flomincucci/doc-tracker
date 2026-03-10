const urlInput = document.getElementById('url-input');
const addBtn = document.getElementById('add-btn');
const searchInput = document.getElementById('search-input');
const docList = document.getElementById('doc-list');
const docFrame = document.getElementById('doc-frame');
const emptyState = document.getElementById('empty-state');
const statusMsg = document.getElementById('add-status');
const openBtn = document.getElementById('open-btn');
const tagFilters = document.getElementById('tag-filters');

let docs = [];
let activeId = null;
let searchQuery = '';
let activeTags = new Set();

function embedUrl(docId) {
  return `https://docs.google.com/document/d/${docId}/preview`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function setStatus(msg, type = '') {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg ${type}`;
}

function filteredDocs() {
  return docs.filter(doc => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (doc.title || '').toLowerCase().includes(q) ||
        (doc.authors || '').toLowerCase().includes(q) ||
        (doc.tags || []).some(t => t.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    if (activeTags.size > 0) {
      const docTags = new Set(doc.tags || []);
      if (![...activeTags].every(t => docTags.has(t))) return false;
    }
    return true;
  });
}

function renderTagFilters() {
  const allTags = [...new Set(docs.flatMap(d => d.tags || []))].sort();
  if (allTags.length === 0) {
    tagFilters.innerHTML = '';
    return;
  }
  tagFilters.innerHTML = allTags.map(t => `
    <button class="filter-tag ${activeTags.has(t) ? 'active' : ''}" data-tag="${escHtml(t)}">${escHtml(t)}</button>
  `).join('');
}

tagFilters.addEventListener('click', e => {
  const btn = e.target.closest('.filter-tag');
  if (!btn) return;
  const tag = btn.dataset.tag;
  if (activeTags.has(tag)) activeTags.delete(tag);
  else activeTags.add(tag);
  renderTagFilters();
  renderList();
});

function renderList() {
  const visible = filteredDocs();

  if (docs.length === 0) {
    docList.innerHTML = '<p class="empty-list">No documents yet.<br/>Paste a link above.</p>';
    return;
  }

  if (visible.length === 0) {
    docList.innerHTML = '<p class="empty-list">No results.</p>';
    return;
  }

  docList.innerHTML = visible.map(doc => `
    <div class="doc-item ${doc.id === activeId ? 'active' : ''}" data-id="${doc.id}" data-docid="${doc.doc_id}">
      <div class="doc-title" data-id="${doc.id}" title="Click to edit title">${escHtml(doc.title || 'Untitled')}</div>
      ${doc.authors ? `<div class="doc-authors">${escHtml(doc.authors)}</div>` : ''}
      <div class="doc-date">${formatDate(doc.created_at)}</div>
<div class="doc-user-tags">
        ${(doc.tags || []).map(t => `
          <span class="tag user-tag">
            ${escHtml(t)}<button class="tag-remove-btn" data-id="${doc.id}" data-tag="${escHtml(t)}" title="Remove tag">✕</button>
          </span>
        `).join('')}
        <button class="tag-add-btn" data-id="${doc.id}" title="Add tag">+ tag</button>
      </div>
      <button class="delete-btn" data-id="${doc.id}" title="Remove">✕</button>
    </div>
  `).join('');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openDoc(id, docId) {
  activeId = id;
  renderList();
  emptyState.style.display = 'none';
  docFrame.style.display = 'block';
  docFrame.src = embedUrl(docId);
  openBtn.href = `https://docs.google.com/document/d/${docId}/edit`;
  openBtn.style.display = '';
}

docList.addEventListener('click', e => {
  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    e.stopPropagation();
    deleteDoc(Number(deleteBtn.dataset.id));
    return;
  }

  const tagRemoveBtn = e.target.closest('.tag-remove-btn');
  if (tagRemoveBtn) {
    e.stopPropagation();
    const id = Number(tagRemoveBtn.dataset.id);
    const tag = tagRemoveBtn.dataset.tag;
    const doc = docs.find(d => d.id === id);
    if (doc) updateTags(id, (doc.tags || []).filter(t => t !== tag));
    return;
  }

  const tagAddBtn = e.target.closest('.tag-add-btn');
  if (tagAddBtn) {
    e.stopPropagation();
    const id = Number(tagAddBtn.dataset.id);
    showTagInput(tagAddBtn, id);
    return;
  }

  const titleEl = e.target.closest('.doc-title');
  if (titleEl) {
    e.stopPropagation();
    editTitle(titleEl, Number(titleEl.dataset.id));
    return;
  }

  const item = e.target.closest('.doc-item');
  if (item) openDoc(Number(item.dataset.id), item.dataset.docid);
});

function editTitle(titleEl, docId) {
  const doc = docs.find(d => d.id === docId);
  const input = document.createElement('input');
  input.className = 'title-input';
  input.value = doc?.title || '';
  titleEl.replaceWith(input);
  input.select();

  function commit() {
    const val = input.value.trim();
    if (val && val !== doc?.title) {
      updateTitle(docId, val);
    } else {
      renderList();
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') renderList();
  });
  input.addEventListener('blur', commit);
}

async function updateTitle(id, title) {
  const res = await fetch(`/api/docs/${id}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  const doc = docs.find(d => d.id === id);
  if (doc) doc.title = data.title;
  renderList();
}

function showTagInput(btn, docId) {
  if (btn.querySelector('input')) return;
  const input = document.createElement('input');
  input.className = 'tag-input';
  input.placeholder = 'tag name…';
  btn.replaceWith(input);
  input.focus();

  function commit() {
    const val = input.value.trim();
    if (val) {
      const doc = docs.find(d => d.id === docId);
      const current = doc?.tags || [];
      if (!current.includes(val)) updateTags(docId, [...current, val]);
      else renderList();
    } else {
      renderList();
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') renderList();
  });
  input.addEventListener('blur', commit);
}

async function updateTags(id, tags) {
  const res = await fetch(`/api/docs/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  const data = await res.json();
  const doc = docs.find(d => d.id === id);
  if (doc) doc.tags = data.tags;
  renderTagFilters();
  renderList();
}

async function addDoc() {
  const url = urlInput.value.trim();
  if (!url) return;

  addBtn.disabled = true;
  setStatus('Fetching document info...', 'loading');

  try {
    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add document');

    urlInput.value = '';
    setStatus('Document added.', 'success');
    setTimeout(() => setStatus(''), 2500);

    const idx = docs.findIndex(d => d.id === data.id);
    if (idx !== -1) docs[idx] = data;
    else docs.unshift(data);

    renderTagFilters();
    renderList();
    openDoc(data.id, data.doc_id);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    addBtn.disabled = false;
  }
}

async function deleteDoc(id) {
  await fetch(`/api/docs/${id}`, { method: 'DELETE' });
  docs = docs.filter(d => d.id !== id);
  const remainingTags = new Set(docs.flatMap(d => d.tags || []));
  for (const t of activeTags) if (!remainingTags.has(t)) activeTags.delete(t);
  renderTagFilters();
  if (activeId === id) {
    activeId = null;
    docFrame.style.display = 'none';
    docFrame.src = '';
    emptyState.style.display = '';
    openBtn.style.display = 'none';
  }
  renderList();
}

async function loadDocs() {
  const res = await fetch('/api/docs');
  docs = await res.json();
  renderTagFilters();
  renderList();
}

document.getElementById('export-btn').addEventListener('click', () => {
  const data = filteredDocs().map(({ id, ...d }) => d);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `rfc-library-${new Date().toISOString().slice(0,10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('import-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const importStatus = document.getElementById('import-status');
  try {
    const data = JSON.parse(await file.text());
    const payload = Array.isArray(data) ? data : [];
    const res = await fetch('/api/docs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs: payload }),
    });
    const result = await res.json();
    importStatus.textContent = `${result.imported} imported`;
    importStatus.className = 'import-status success';
    setTimeout(() => { importStatus.textContent = ''; importStatus.className = 'import-status'; }, 3000);
    await loadDocs();
  } catch {
    importStatus.textContent = 'Import failed';
    importStatus.className = 'import-status error';
    setTimeout(() => { importStatus.textContent = ''; importStatus.className = 'import-status'; }, 3000);
  }
  e.target.value = '';
});

addBtn.addEventListener('click', addDoc);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addDoc(); });
searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim(); renderList(); });

// Auto-detect paste
urlInput.addEventListener('paste', e => {
  setTimeout(() => {
    const val = urlInput.value.trim();
    if (val.includes('docs.google.com/document')) addDoc();
  }, 50);
});

loadDocs();

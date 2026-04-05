/* ==========================================
   LINKVAULT - APPLICATION PRINCIPALE v2.1
   Corrections : Tags mobile, Edit/Delete complet
   ========================================== */

'use strict';

// ======= ÉTAT GLOBAL =======
const AppState = {
  items: [],
  collections: [],
  trash: [],
  settings: {
    theme: 'dark',
    defaultView: 'grid',
    accentColor: '#6c63ff',
    sortBy: 'date_desc'
  },
  currentView: 'all',
  currentCollection: null,
  currentFilter: 'all',
  isGridView: true,
  searchQuery: '',
  editingId: null,
  currentTags: { link: [], note: [] },
  selectedColor: { link: '#6c63ff', note: '#6c63ff', collection: '#6c63ff' },
  selectedIcon: 'folder',
  shareItem: null,
  deferredInstallPrompt: null
};

// ======= STORAGE =======
const Storage = {
  save() {
    try {
      localStorage.setItem('lv_items', JSON.stringify(AppState.items));
      localStorage.setItem('lv_collections', JSON.stringify(AppState.collections));
      localStorage.setItem('lv_trash', JSON.stringify(AppState.trash));
      localStorage.setItem('lv_settings', JSON.stringify(AppState.settings));
      UI.updateStorageInfo();
    } catch (e) {
      Toast.show('Espace de stockage insuffisant', 'error');
    }
  },

  load() {
    try {
      const items        = localStorage.getItem('lv_items');
      const collections  = localStorage.getItem('lv_collections');
      const trash        = localStorage.getItem('lv_trash');
      const settings     = localStorage.getItem('lv_settings');
      if (items)       AppState.items       = JSON.parse(items);
      if (collections) AppState.collections = JSON.parse(collections);
      if (trash)       AppState.trash       = JSON.parse(trash);
      if (settings)    AppState.settings    = { ...AppState.settings, ...JSON.parse(settings) };
    } catch (e) {
      console.error('Erreur chargement:', e);
    }
  },

  getSize() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) total += localStorage[key].length * 2;
    }
    return total;
  }
};

// ======= UTILITAIRES =======
const Utils = {
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  formatDate(ts) {
    const d    = new Date(ts);
    const now  = new Date();
    const diff = now - d;
    if (diff < 60000)     return 'À l\'instant';
    if (diff < 3600000)   return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000)  return `Il y a ${Math.floor(diff / 3600000)} h`;
    if (diff < 604800000) return `Il y a ${Math.floor(diff / 86400000)} j`;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  },

  getDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return url; }
  },

  getFaviconUrl(url) {
    try {
      const domain = new URL(url).origin;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch { return null; }
  },

  sanitizeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  parseMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
      .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/_(.+?)_/g,       '<u>$1</u>')
      .replace(/`(.+?)`/g,       '<code>$1</code>')
      .replace(/^> (.+)$/gm,     '<blockquote>$1</blockquote>')
      .replace(/^\- \[x\] (.+)$/gm, '<div class="checklist-item"><input type="checkbox" checked disabled> $1</div>')
      .replace(/^\- \[ \] (.+)$/gm,  '<div class="checklist-item"><input type="checkbox" disabled> $1</div>')
      .replace(/^- (.+)$/gm,   '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/^(?!<[h|u|b|l|d|i|c])(.+)$/gm, '<p>$1</p>');
  },

  highlightText(text, query) {
    if (!query || !text) return Utils.sanitizeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(`(${escaped})`, 'gi');
    return Utils.sanitizeHtml(text).replace(regex, '<mark>$1</mark>');
  },

  sortItems(items) {
    const { sortBy } = AppState.settings;
    return [...items].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      switch (sortBy) {
        case 'date_desc':  return b.createdAt - a.createdAt;
        case 'date_asc':   return a.createdAt - b.createdAt;
        case 'title_asc':  return (a.title || '').localeCompare(b.title || '', 'fr');
        case 'title_desc': return (b.title || '').localeCompare(a.title || '', 'fr');
        case 'type':       return a.type.localeCompare(b.type);
        default:           return b.createdAt - a.createdAt;
      }
    });
  },

  countWords(text) {
    const words = (text || '').trim().split(/\s+/).filter(w => w.length > 0);
    return { words: words.length, chars: (text || '').length };
  },

  formatBytes(bytes) {
    if (bytes < 1024)          return bytes + ' o';
    if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  },

  /* Nettoie un tag brut */
  cleanTag(raw) {
    return raw.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç_-]/gi, '');
  }
};

// ======= TOAST =======
const Toast = {
  show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const icons = {
      success: 'check_circle',
      error:   'error_outline',
      warning: 'warning_amber',
      info:    'info'
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-icons-outlined">${icons[type] || 'info'}</span>
      <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// ======= UI MANAGER =======
const UI = {
  updateBadges() {
    const links     = AppState.items.filter(i => i.type === 'link').length;
    const notes     = AppState.items.filter(i => i.type === 'note').length;
    const favorites = AppState.items.filter(i => i.favorite).length;
    const all       = AppState.items.length;
    const trash     = AppState.trash.length;
    const allTags   = [...new Set(AppState.items.flatMap(i => i.tags || []))];

    document.getElementById('badgeAll').textContent       = all;
    document.getElementById('badgeLinks').textContent     = links;
    document.getElementById('badgeNotes').textContent     = notes;
    document.getElementById('badgeFavorites').textContent = favorites;
    document.getElementById('badgeTrash').textContent     = trash;

    document.getElementById('statLinks').textContent     = `${links} lien${links > 1 ? 's' : ''}`;
    document.getElementById('statNotes').textContent     = `${notes} note${notes > 1 ? 's' : ''}`;
    document.getElementById('statFavorites').textContent = `${favorites} favori${favorites > 1 ? 's' : ''}`;
    document.getElementById('statTags').textContent      = `${allTags.length} tag${allTags.length > 1 ? 's' : ''}`;
  },

  updateStorageInfo() {
    const size    = Storage.getSize();
    const maxSize = 5 * 1024 * 1024;
    const percent = Math.min((size / maxSize) * 100, 100);
    document.getElementById('storageFill').style.width = percent + '%';
    document.getElementById('storageSize').textContent = Utils.formatBytes(size) + ' utilisés';
  },

  updateCollectionsList() {
    const list      = document.getElementById('collectionsList');
    const linkSel   = document.getElementById('linkCollection');
    const noteSel   = document.getElementById('noteCollection');

    list.innerHTML = AppState.collections.map(c => `
      <a class="collection-nav-item ${AppState.currentCollection === c.id ? 'active' : ''}"
         data-collection="${c.id}" href="#">
        <span class="material-icons-outlined" style="color:${c.color};font-size:16px!important">${c.icon}</span>
        <span style="flex:1">${Utils.sanitizeHtml(c.name)}</span>
        <span style="font-size:.7rem;color:var(--text-muted)">
          ${AppState.items.filter(i => i.collection === c.id).length}
        </span>
      </a>`).join('');

    const opts = `<option value="">Sans collection</option>` +
      AppState.collections.map(c => `<option value="${c.id}">${Utils.sanitizeHtml(c.name)}</option>`).join('');
    if (linkSel) linkSel.innerHTML = opts;
    if (noteSel) noteSel.innerHTML = opts;

    list.querySelectorAll('[data-collection]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const colId = el.dataset.collection;
        AppState.currentCollection = colId;
        AppState.currentView = 'collection';
        const col = AppState.collections.find(c => c.id === colId);
        document.getElementById('viewTitle').textContent    = col ? col.name : 'Collection';
        document.getElementById('viewSubtitle').textContent = 'Collection';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.collection-nav-item').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        UI.updateCollectionsList();
        ContentRenderer.render();
        Sidebar.close();
      });
    });
  },

  initTheme() {
    const theme = AppState.settings.theme;
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#themeToggle .material-icons-outlined');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    const dmToggle = document.getElementById('settingDarkMode');
    if (dmToggle) dmToggle.checked = theme === 'dark';

    const acc = AppState.settings.accentColor;
    const r   = parseInt(acc.slice(1,3), 16);
    const g   = parseInt(acc.slice(3,5), 16);
    const b   = parseInt(acc.slice(5,7), 16);
    document.documentElement.style.setProperty('--accent',       acc);
    document.documentElement.style.setProperty('--accent-light', `rgba(${r},${g},${b},.15)`);
    document.documentElement.style.setProperty('--accent-hover', `rgba(${r},${g},${b},.85)`);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', acc);
  },

  toggleTheme() {
    AppState.settings.theme = AppState.settings.theme === 'dark' ? 'light' : 'dark';
    UI.initTheme();
    Storage.save();
  }
};

// ======= SIDEBAR =======
const Sidebar = {
  open()   {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  },
  close()  {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
    document.body.style.overflow = '';
  },
  toggle() {
    document.getElementById('sidebar').classList.contains('open') ? this.close() : this.open();
  }
};

// ======= MODAL MANAGER =======
const Modal = {
  open(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
  },
  close(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.remove('open');
      if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
    }
  },
  closeAll() {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
};

// ============================================================
//  TAGS MANAGER  ← correction principale mobile
// ============================================================
const TagsManager = {
  /**
   * Initialise un champ de saisie de tags.
   * Séparateurs acceptés : Entrée, virgule, espace, point-virgule
   * Fonctionne avec le clavier virtuel Android/iOS.
   */
  init(type) {
    const input   = document.getElementById(`${type}Tags`);
    const display = document.getElementById(`${type}TagsDisplay`);
    if (!input || !display) return;

    // Éviter les doublons de listeners
    const fresh = input.cloneNode(true);
    input.parentNode.replaceChild(fresh, input);
    const inp = document.getElementById(`${type}Tags`);

    /* ── keydown : Entrée & virgule ── */
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
        e.preventDefault();
        this._commitInput(type, inp);
      }
      // Supprimer le dernier tag avec Backspace si input vide
      if (e.key === 'Backspace' && inp.value === '' && AppState.currentTags[type].length > 0) {
        AppState.currentTags[type].pop();
        this.render(type);
      }
    });

    /* ── input : détection virgule dans le texte collé ou clavier mobile ── */
    inp.addEventListener('input', e => {
      const val = inp.value;
      if (val.includes(',') || val.includes(';') || val.includes(' ')) {
        // Splitter sur les séparateurs
        const parts = val.split(/[,; ]+/);
        parts.slice(0, -1).forEach(p => this._addTag(type, p));
        inp.value = parts[parts.length - 1]; // garder le reste en cours
      }
    });

    /* ── blur : valider ce qui reste ── */
    inp.addEventListener('blur', () => {
      if (inp.value.trim()) this._commitInput(type, inp);
    });
  },

  _commitInput(type, inp) {
    const val = inp.value;
    // Peut contenir plusieurs tags séparés
    val.split(/[,; ]+/).forEach(p => this._addTag(type, p));
    inp.value = '';
  },

  _addTag(type, raw) {
    const tag = Utils.cleanTag(raw);
    if (!tag) return false;
    if (AppState.currentTags[type].includes(tag)) return false;
    if (AppState.currentTags[type].length >= 10) {
      Toast.show('Maximum 10 tags', 'warning');
      return false;
    }
    AppState.currentTags[type].push(tag);
    this.render(type);
    return true;
  },

  removeTag(type, tag) {
    AppState.currentTags[type] = AppState.currentTags[type].filter(t => t !== tag);
    this.render(type);
  },

  render(type) {
    const display = document.getElementById(`${type}TagsDisplay`);
    if (!display) return;
    display.innerHTML = AppState.currentTags[type].map(tag => `
      <span class="tag-removable" data-tag="${Utils.sanitizeHtml(tag)}" data-type="${type}">
        #${Utils.sanitizeHtml(tag)}
        <button class="tag-remove" aria-label="Supprimer ${tag}">
          <span class="material-icons-outlined">close</span>
        </button>
      </span>`).join('');

    display.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const span = btn.closest('[data-tag]');
        this.removeTag(span.dataset.type, span.dataset.tag);
      });
    });
  },

  /* Bouton "+" affiché à côté du champ sur mobile */
  setupAddButton(type) {
    const btnId = `${type}TagsAdd`;
    const btn   = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const inp = document.getElementById(`${type}Tags`);
      if (inp.value.trim()) {
        this._commitInput(type, inp);
        inp.value = '';
      }
      inp.focus();
    });
  }
};

// ======= CONTENT RENDERER =======
const ContentRenderer = {
  render() {
    const content = document.getElementById('contentArea');
    let items = [...AppState.items];

    switch (AppState.currentView) {
      case 'links':      items = items.filter(i => i.type === 'link'); break;
      case 'notes':      items = items.filter(i => i.type === 'note'); break;
      case 'favorites':  items = items.filter(i => i.favorite); break;
      case 'trash':      this.renderTrash(); return;
      case 'tags':       this.renderTags(); return;
      case 'collection': items = items.filter(i => i.collection === AppState.currentCollection); break;
    }

    if (AppState.searchQuery) {
      const q = AppState.searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.title       && i.title.toLowerCase().includes(q))       ||
        (i.url         && i.url.toLowerCase().includes(q))         ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.content     && i.content.toLowerCase().includes(q))     ||
        (i.tags        && i.tags.some(t => t.toLowerCase().includes(q)))
      );
      if (AppState.currentFilter === 'links')     items = items.filter(i => i.type === 'link');
      if (AppState.currentFilter === 'notes')     items = items.filter(i => i.type === 'note');
      if (AppState.currentFilter === 'favorites') items = items.filter(i => i.favorite);
    }

    items = Utils.sortItems(items);

    if (items.length === 0) {
      content.innerHTML = this.emptyState();
      document.getElementById('emptyStateCTA')?.addEventListener('click', () =>
        document.getElementById('fabMain').click());
      return;
    }

    if (AppState.currentView === 'all' && !AppState.searchQuery) {
      const pinned = items.filter(i => i.pinned);
      const links  = items.filter(i => i.type === 'link'  && !i.pinned);
      const notes  = items.filter(i => i.type === 'note'  && !i.pinned);
      let html = '';

      if (pinned.length) html += this._section('push_pin', 'var(--accent)', `Épinglés`, pinned);
      if (links.length)  html += this._section('link',     'var(--accent)', `Liens (${links.length})`,  links,  pinned.length > 0);
      if (notes.length)  html += this._section('sticky_note_2', '#43d9ad', `Notes (${notes.length})`,  notes,  links.length > 0 || pinned.length > 0);

      content.innerHTML = html;
    } else {
      content.innerHTML = `
        <div class="${AppState.isGridView ? 'items-grid' : 'items-list'}">
          ${items.map(i => this.renderCard(i)).join('')}
        </div>`;
    }

    this.attachCardEvents();
  },

  _section(icon, color, label, items, marginTop = false) {
    return `
      <div class="section-header" style="${marginTop ? 'margin-top:20px' : ''}">
        <span class="material-icons-outlined" style="color:${color};font-size:18px">${icon}</span>
        <h2>${label}</h2>
        <div class="section-divider"></div>
      </div>
      <div class="${AppState.isGridView ? 'items-grid' : 'items-list'}">
        ${items.map(i => this.renderCard(i)).join('')}
      </div>`;
  },

  renderCard(item) {
    const isLink    = item.type === 'link';
    const collection= AppState.collections.find(c => c.id === item.collection);
    const favIcon   = isLink ? Utils.getFaviconUrl(item.url) : null;
    const q         = AppState.searchQuery;
    const cardColor = item.color || 'var(--accent)';

    // ── Badges d'action communs ──
    const actionBtns = `
      ${isLink ? `
        <button class="card-action-btn open-link" data-id="${item.id}" title="Ouvrir le lien">
          <span class="material-icons-outlined">open_in_new</span>
        </button>` : ''}
      <button class="card-action-btn toggle-fav ${item.favorite ? 'active' : ''}"
              data-id="${item.id}" title="${item.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
        <span class="material-icons-outlined">${item.favorite ? 'bookmark' : 'bookmark_border'}</span>
      </button>
      <button class="card-action-btn share-item" data-id="${item.id}" title="Partager">
        <span class="material-icons-outlined">share</span>
      </button>
      <button class="card-action-btn edit-item" data-id="${item.id}" title="Modifier">
        <span class="material-icons-outlined">edit</span>
      </button>
      <button class="card-action-btn delete trash-item" data-id="${item.id}" title="Mettre à la corbeille">
        <span class="material-icons-outlined">delete_outline</span>
      </button>`;

    if (AppState.isGridView) {
      return `
        <div class="card ${item.pinned ? 'pinned' : ''}" data-id="${item.id}"
             style="--card-color:${cardColor}">
          ${item.pinned ? '<span class="material-icons-outlined pin-indicator">push_pin</span>' : ''}

          <div class="card-header">
            ${isLink ? `
              <div class="card-favicon-placeholder">
                <img class="card-favicon" src="${favIcon}" alt=""
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                     loading="lazy"/>
                <span class="favicon-fallback material-icons-outlined"
                      style="display:none;font-size:13px;color:var(--accent)">link</span>
              </div>` : `
              <span class="material-icons-outlined"
                    style="color:#43d9ad;font-size:18px;flex-shrink:0">sticky_note_2</span>`}
            <span class="card-title">
              ${q ? Utils.highlightText(item.title, q) : Utils.sanitizeHtml(item.title)}
            </span>
            ${item.favorite ? '<span class="material-icons-outlined" style="color:#ffd166;font-size:16px;flex-shrink:0">bookmark</span>' : ''}
          </div>

          ${collection ? `
            <div class="card-collection"
                 style="background:${collection.color}22;color:${collection.color}">
              <span class="material-icons-outlined" style="font-size:12px">${collection.icon}</span>
              ${Utils.sanitizeHtml(collection.name)}
            </div>` : ''}

          <div class="card-body">
            ${isLink && item.url ? `
              <div class="card-url">
                <span class="material-icons-outlined">language</span>
                ${Utils.getDomain(item.url)}
              </div>` : ''}
            ${item.description || item.content ? `
              <p class="card-description">
                ${q
                  ? Utils.highlightText((item.description || item.content || '').substring(0, 200), q)
                  : Utils.sanitizeHtml((item.description || item.content || '').substring(0, 200))}
              </p>` : ''}
          </div>

          ${item.tags && item.tags.length ? `
            <div class="card-tags">
              ${item.tags.slice(0, 4).map(t =>
                `<span class="tag" data-tag="${Utils.sanitizeHtml(t)}">#${Utils.sanitizeHtml(t)}</span>`
              ).join('')}
              ${item.tags.length > 4 ? `<span class="tag">+${item.tags.length - 4}</span>` : ''}
            </div>` : ''}

          <div class="card-footer">
            <span class="card-date">
              <span class="material-icons-outlined">schedule</span>
              ${Utils.formatDate(item.updatedAt || item.createdAt)}
            </span>
            <div class="card-actions">${actionBtns}</div>
          </div>
        </div>`;
    }

    // ── Vue liste ──
    return `
      <div class="card ${item.pinned ? 'pinned' : ''}" data-id="${item.id}"
           style="--card-color:${cardColor}">
        <div class="card-type-icon ${isLink ? 'link-icon' : 'note-icon'}">
          <span class="material-icons-outlined">${isLink ? 'link' : 'sticky_note_2'}</span>
        </div>
        <div class="card-body">
          <div class="card-title" style="margin-bottom:4px">
            ${q ? Utils.highlightText(item.title, q) : Utils.sanitizeHtml(item.title)}
            ${item.favorite ? '<span class="material-icons-outlined" style="color:#ffd166;font-size:14px;vertical-align:middle;margin-left:4px">bookmark</span>' : ''}
          </div>
          ${isLink && item.url ? `<div class="card-url"><span class="material-icons-outlined">language</span>${Utils.getDomain(item.url)}</div>` : ''}
          ${item.tags && item.tags.length ? `
            <div class="card-tags">
              ${item.tags.slice(0, 3).map(t => `<span class="tag">#${Utils.sanitizeHtml(t)}</span>`).join('')}
            </div>` : ''}
          <span class="card-date">
            <span class="material-icons-outlined">schedule</span>
            ${Utils.formatDate(item.updatedAt || item.createdAt)}
          </span>
        </div>
        <div class="card-actions" style="opacity:1">${actionBtns}</div>
      </div>`;
  },

  /* ── Corbeille ── */
  renderTrash() {
    const content = document.getElementById('contentArea');
    if (!AppState.trash.length) {
      content.innerHTML = `
        <div class="empty-state">
          <span class="material-icons-outlined empty-state-icon">delete_sweep</span>
          <h3>Corbeille vide</h3>
          <p>Les éléments supprimés apparaîtront ici</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-danger" id="btnEmptyTrash">
          <span class="material-icons-outlined">delete_forever</span>
          Vider (${AppState.trash.length})
        </button>
      </div>
      <div class="${AppState.isGridView ? 'items-grid' : 'items-list'}">
        ${AppState.trash.map(item => `
          <div class="card in-trash" data-id="${item.id}"
               style="--card-color:${item.color || 'var(--accent)'}">
            <div class="card-header">
              <span class="material-icons-outlined" style="font-size:18px;color:var(--text-muted);flex-shrink:0">
                ${item.type === 'link' ? 'link' : 'sticky_note_2'}
              </span>
              <span class="card-title">${Utils.sanitizeHtml(item.title)}</span>
            </div>
            <div class="card-footer">
              <span class="card-date">
                <span class="material-icons-outlined">delete</span>
                ${Utils.formatDate(item.deletedAt)}
              </span>
              <div class="card-actions" style="opacity:1">
                <button class="card-action-btn restore-item" data-id="${item.id}" title="Restaurer">
                  <span class="material-icons-outlined">restore_from_trash</span>
                </button>
                <button class="card-action-btn delete permanent-delete" data-id="${item.id}" title="Supprimer définitivement">
                  <span class="material-icons-outlined">delete_forever</span>
                </button>
              </div>
            </div>
          </div>`).join('')}
      </div>`;

    document.getElementById('btnEmptyTrash').addEventListener('click', () => {
      if (confirm(`Supprimer définitivement ${AppState.trash.length} élément(s) ?`)) {
        AppState.trash = [];
        Storage.save();
        UI.updateBadges();
        this.render();
        Toast.show('Corbeille vidée', 'success');
      }
    });

    document.querySelectorAll('.restore-item').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = AppState.trash.findIndex(i => i.id === btn.dataset.id);
        if (idx !== -1) {
          const item = AppState.trash.splice(idx, 1)[0];
          delete item.deletedAt;
          AppState.items.unshift(item);
          Storage.save();
          UI.updateBadges();
          this.render();
          Toast.show('Élément restauré', 'success');
        }
      });
    });

    document.querySelectorAll('.permanent-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('Supprimer définitivement ?')) {
          AppState.trash = AppState.trash.filter(i => i.id !== btn.dataset.id);
          Storage.save();
          UI.updateBadges();
          this.render();
          Toast.show('Supprimé définitivement', 'info');
        }
      });
    });
  },

  /* ── Tags view ── */
  renderTags() {
    const content = document.getElementById('contentArea');
    const allTags = {};
    AppState.items.forEach(item => {
      (item.tags || []).forEach(t => { allTags[t] = (allTags[t] || 0) + 1; });
    });

    if (!Object.keys(allTags).length) {
      content.innerHTML = `
        <div class="empty-state">
          <span class="material-icons-outlined empty-state-icon">label_off</span>
          <h3>Aucun tag</h3>
          <p>Ajoutez des tags à vos liens et notes</p>
        </div>`;
      return;
    }

    const sorted = Object.entries(allTags).sort((a, b) => b[1] - a[1]);
    content.innerHTML = `
      <div class="tags-cloud">
        ${sorted.map(([tag, count]) => `
          <div class="tag-cloud-item" data-tag="${Utils.sanitizeHtml(tag)}">
            <span class="material-icons-outlined" style="font-size:16px">label</span>
            ${Utils.sanitizeHtml(tag)}
            <span class="tag-count">${count}</span>
          </div>`).join('')}
      </div>
      <div id="taggedItems" style="margin-top:20px"></div>`;

    content.querySelectorAll('.tag-cloud-item').forEach(el => {
      el.addEventListener('click', () => {
        content.querySelectorAll('.tag-cloud-item').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        const tag    = el.dataset.tag;
        const tagged = AppState.items.filter(i => i.tags && i.tags.includes(tag));
        document.getElementById('taggedItems').innerHTML = `
          <div class="section-header">
            <span class="material-icons-outlined" style="font-size:18px;color:var(--accent)">label</span>
            <h2>#${Utils.sanitizeHtml(tag)} (${tagged.length})</h2>
            <div class="section-divider"></div>
          </div>
          <div class="${AppState.isGridView ? 'items-grid' : 'items-list'}">
            ${tagged.map(i => this.renderCard(i)).join('')}
          </div>`;
        this.attachCardEvents();
      });
    });
  },

  emptyState() {
    const m = {
      all:        { icon: 'inventory_2',   title: 'Votre coffre est vide',   desc: 'Commencez par ajouter un lien ou une note' },
      links:      { icon: 'link_off',      title: 'Aucun lien',              desc: 'Ajoutez votre premier lien' },
      notes:      { icon: 'edit_note',     title: 'Aucune note',             desc: 'Créez votre première note' },
      favorites:  { icon: 'bookmark_border',title:'Aucun favori',            desc: 'Marquez des éléments comme favoris' },
      collection: { icon: 'folder_open',   title: 'Collection vide',         desc: 'Ajoutez des éléments à cette collection' }
    };
    const msg = AppState.searchQuery
      ? { icon: 'search_off', title: 'Aucun résultat', desc: `Rien trouvé pour "${AppState.searchQuery}"` }
      : (m[AppState.currentView] || m.all);

    return `
      <div class="empty-state">
        <span class="material-icons-outlined empty-state-icon">${msg.icon}</span>
        <h3>${msg.title}</h3>
        <p>${msg.desc}</p>
        ${!AppState.searchQuery ? `
          <button class="btn btn-primary" id="emptyStateCTA">
            <span class="material-icons-outlined">add</span>Ajouter
          </button>` : ''}
      </div>`;
  },

  /* ── Attache tous les events des cards ── */
  attachCardEvents() {
    // Ouvrir lien
    document.querySelectorAll('.open-link').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = AppState.items.find(i => i.id === btn.dataset.id);
        if (item?.url) window.open(item.url, '_blank', 'noopener,noreferrer');
      });
    });

    // Favori toggle
    document.querySelectorAll('.toggle-fav').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = AppState.items.find(i => i.id === btn.dataset.id);
        if (item) {
          item.favorite  = !item.favorite;
          item.updatedAt = Date.now();
          Storage.save();
          UI.updateBadges();
          this.render();
          Toast.show(item.favorite ? '⭐ Ajouté aux favoris' : 'Retiré des favoris', 'info');
        }
      });
    });

    // Partager
    document.querySelectorAll('.share-item').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = AppState.items.find(i => i.id === btn.dataset.id);
        if (item) ShareManager.open(item);
      });
    });

    // ── MODIFIER ──────────────────────────────────────────────
    document.querySelectorAll('.edit-item').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = AppState.items.find(i => i.id === btn.dataset.id);
        if (!item) return;
        if (item.type === 'link') Forms.openLink(item);
        else                      Forms.openNote(item);
      });
    });

    // ── SUPPRIMER (corbeille) ─────────────────────────────────
    document.querySelectorAll('.trash-item').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id  = btn.dataset.id;
        const idx = AppState.items.findIndex(i => i.id === id);
        if (idx !== -1) {
          const item    = AppState.items.splice(idx, 1)[0];
          item.deletedAt = Date.now();
          AppState.trash.push(item);
          Storage.save();
          UI.updateBadges();
          this.render();
          Toast.show('Déplacé dans la corbeille', 'warning');
        }
      });
    });

    // Clic sur tag → recherche
    document.querySelectorAll('.card .tag[data-tag]').forEach(tag => {
      tag.addEventListener('click', e => {
        e.stopPropagation();
        const t = tag.dataset.tag;
        AppState.searchQuery = t;
        document.getElementById('searchInput').value = t;
        document.getElementById('searchContainer').classList.add('visible');
        document.getElementById('searchClear').style.display = 'flex';
        this.render();
      });
    });

    // CTA empty state
    document.getElementById('emptyStateCTA')?.addEventListener('click', () =>
      document.getElementById('fabMain').click());
  }
};

// ======= FORMS =======
const Forms = {
  /* ─────────────── LIEN ─────────────── */
  openLink(item = null) {
    AppState.editingId           = item ? item.id : null;
    AppState.currentTags.link    = item ? [...(item.tags || [])] : [];
    AppState.selectedColor.link  = item ? (item.color || '#6c63ff') : '#6c63ff';

    // Remplir les champs
    document.getElementById('linkUrl').value         = item?.url         || '';
    document.getElementById('linkTitle').value       = item?.title       || '';
    document.getElementById('linkDescription').value = item?.description || '';
    document.getElementById('linkFavorite').checked  = item?.favorite    || false;
    document.getElementById('linkReminder').value    = item?.reminder    || '';

    // Collection
    UI.updateCollectionsList();
    setTimeout(() => {
      const sel = document.getElementById('linkCollection');
      if (sel) sel.value = item?.collection || '';
    }, 50);

    // Titre de la modal
    document.getElementById('modalLinkTitle').innerHTML = `
      <span class="material-icons-outlined">${item ? 'edit' : 'add_link'}</span>
      ${item ? 'Modifier le lien' : 'Nouveau lien'}`;

    // Tags
    TagsManager.render('link');
    TagsManager.init('link');
    TagsManager.setupAddButton('link');

    // Couleur
    this._syncColorPicker('linkColorPicker', 'link');

    Modal.open('modalLink');

    // Focus URL si nouveau
    if (!item) setTimeout(() => document.getElementById('linkUrl').focus(), 300);
  },

  saveLink() {
    const url   = document.getElementById('linkUrl').value.trim();
    const title = document.getElementById('linkTitle').value.trim();

    if (!url || !title) {
      Toast.show('URL et titre sont requis', 'error');
      if (!url)   document.getElementById('linkUrl').focus();
      else        document.getElementById('linkTitle').focus();
      return;
    }

    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      finalUrl = 'https://' + url;
    }
    try { new URL(finalUrl); }
    catch {
      Toast.show('URL invalide', 'error');
      document.getElementById('linkUrl').focus();
      return;
    }

    const now  = Date.now();
    const orig = AppState.editingId ? AppState.items.find(i => i.id === AppState.editingId) : null;

    const item = {
      id:          AppState.editingId || Utils.generateId(),
      type:        'link',
      url:         finalUrl,
      title,
      description: document.getElementById('linkDescription').value.trim(),
      collection:  document.getElementById('linkCollection').value || null,
      favorite:    document.getElementById('linkFavorite').checked,
      reminder:    document.getElementById('linkReminder').value || null,
      tags:        [...AppState.currentTags.link],
      color:       AppState.selectedColor.link,
      createdAt:   orig?.createdAt || now,
      updatedAt:   now
    };

    if (AppState.editingId) {
      const idx = AppState.items.findIndex(i => i.id === AppState.editingId);
      if (idx !== -1) AppState.items[idx] = item;
      Toast.show('✅ Lien modifié', 'success');
    } else {
      AppState.items.unshift(item);
      Toast.show('✅ Lien ajouté', 'success');
    }

    AppState.editingId = null;
    Storage.save();
    UI.updateBadges();
    ContentRenderer.render();
    Modal.close('modalLink');
  },

  /* ─────────────── NOTE ─────────────── */
  openNote(item = null) {
    AppState.editingId          = item ? item.id : null;
    AppState.currentTags.note   = item ? [...(item.tags || [])] : [];
    AppState.selectedColor.note = item ? (item.color || '#6c63ff') : '#6c63ff';

    document.getElementById('noteTitle').value       = item?.title   || '';
    document.getElementById('noteContent').value     = item?.content || '';
    document.getElementById('noteFavorite').checked  = item?.favorite|| false;
    document.getElementById('notePin').checked       = item?.pinned  || false;

    // Collection
    UI.updateCollectionsList();
    setTimeout(() => {
      const sel = document.getElementById('noteCollection');
      if (sel) sel.value = item?.collection || '';
    }, 50);

    // Reset preview
    document.getElementById('notePreview').classList.add('hidden');
    document.getElementById('noteContent').classList.remove('hidden');
    document.getElementById('btnNotePreview').classList.remove('active');

    // Titre modal
    document.getElementById('modalNoteTitle').innerHTML = `
      <span class="material-icons-outlined">${item ? 'edit' : 'note_add'}</span>
      ${item ? 'Modifier la note' : 'Nouvelle note'}`;

    this.updateWordCount();

    // Tags
    TagsManager.render('note');
    TagsManager.init('note');
    TagsManager.setupAddButton('note');

    // Couleur
    this._syncColorPicker('noteColorPicker', 'note');

    Modal.open('modalNote');
    if (!item) setTimeout(() => document.getElementById('noteTitle').focus(), 300);
  },

  saveNote() {
    const title   = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();

    if (!title && !content) {
      Toast.show('Titre ou contenu requis', 'error');
      document.getElementById('noteTitle').focus();
      return;
    }

    const now  = Date.now();
    const orig = AppState.editingId ? AppState.items.find(i => i.id === AppState.editingId) : null;

    const item = {
      id:         AppState.editingId || Utils.generateId(),
      type:       'note',
      title:      title || 'Sans titre',
      content,
      collection: document.getElementById('noteCollection').value || null,
      favorite:   document.getElementById('noteFavorite').checked,
      pinned:     document.getElementById('notePin').checked,
      tags:       [...AppState.currentTags.note],
      color:      AppState.selectedColor.note,
      createdAt:  orig?.createdAt || now,
      updatedAt:  now
    };

    if (AppState.editingId) {
      const idx = AppState.items.findIndex(i => i.id === AppState.editingId);
      if (idx !== -1) AppState.items[idx] = item;
      Toast.show('✅ Note modifiée', 'success');
    } else {
      AppState.items.unshift(item);
      Toast.show('✅ Note créée', 'success');
    }

    AppState.editingId = null;
    Storage.save();
    UI.updateBadges();
    ContentRenderer.render();
    Modal.close('modalNote');
  },

  /* ─────────────── COLLECTION ─────────────── */
  openCollection(col = null) {
    AppState.editingId              = col ? col.id : null;
    AppState.selectedColor.collection = col ? (col.color || '#6c63ff') : '#6c63ff';
    AppState.selectedIcon             = col ? (col.icon  || 'folder')   : 'folder';

    document.getElementById('collectionName').value = col?.name || '';

    document.getElementById('modalCollectionTitle').innerHTML = `
      <span class="material-icons-outlined">${col ? 'edit' : 'create_new_folder'}</span>
      ${col ? 'Modifier la collection' : 'Nouvelle collection'}`;

    document.getElementById('btnSaveCollection').innerHTML = `
      <span class="material-icons-outlined">save</span>
      ${col ? 'Modifier' : 'Créer'}`;

    // Sync icône & couleur
    document.querySelectorAll('#collectionIconPicker .icon-option').forEach(o => {
      o.classList.toggle('active', o.dataset.icon === AppState.selectedIcon);
    });
    this._syncColorPicker('collectionColorPicker', 'collection');

    Modal.open('modalCollection');
    setTimeout(() => document.getElementById('collectionName').focus(), 300);
  },

  saveCollection() {
    const name = document.getElementById('collectionName').value.trim();
    if (!name) {
      Toast.show('Nom requis', 'error');
      document.getElementById('collectionName').focus();
      return;
    }

    if (AppState.editingId) {
      const col = AppState.collections.find(c => c.id === AppState.editingId);
      if (col) {
        col.name  = name;
        col.icon  = AppState.selectedIcon;
        col.color = AppState.selectedColor.collection;
        Toast.show('✅ Collection modifiée', 'success');
      }
    } else {
      AppState.collections.push({
        id:    Utils.generateId(),
        name,
        icon:  AppState.selectedIcon,
        color: AppState.selectedColor.collection
      });
      Toast.show('✅ Collection créée', 'success');
    }

    AppState.editingId = null;
    document.getElementById('collectionName').value = '';
    Storage.save();
    UI.updateCollectionsList();
    ContentRenderer.render();
    Modal.close('modalCollection');
  },

  /* ─────── helpers ─────── */
  updateWordCount() {
    const { words, chars } = Utils.countWords(document.getElementById('noteContent').value);
    document.getElementById('wordCount').textContent =
      `${words} mot${words > 1 ? 's' : ''} · ${chars} caractère${chars > 1 ? 's' : ''}`;
  },

  _syncColorPicker(pickerId, colorKey) {
    document.querySelectorAll(`#${pickerId} .color-option`).forEach(opt => {
      opt.classList.toggle('active', opt.dataset.color === AppState.selectedColor[colorKey]);
    });
  },

  async fetchMeta() {
    const url = document.getElementById('linkUrl').value.trim();
    if (!url) { Toast.show('Saisissez d\'abord une URL', 'warning'); return; }
    let finalUrl = url;
    if (!url.startsWith('http')) finalUrl = 'https://' + url;
    try {
      new URL(finalUrl);
      document.getElementById('linkUrl').value = finalUrl;
      if (!document.getElementById('linkTitle').value) {
        document.getElementById('linkTitle').value = Utils.getDomain(finalUrl);
      }
      Toast.show('URL validée ✓', 'success');
    } catch {
      Toast.show('URL invalide', 'error');
    }
  }
};

// ======= EXPORT/IMPORT =======
const DataManager = {
  exportJSON() {
    const data = {
      version: '2.1', exportDate: new Date().toISOString(), app: 'LinkVault',
      items: AppState.items, collections: AppState.collections,
      trash: AppState.trash, settings: AppState.settings
    };
    this._dl(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `linkvault-${this._date()}.json`);
    Toast.show('Export JSON réussi', 'success');
  },

  exportCSV() {
    const headers = ['Type','Titre','URL','Description','Tags','Favoris','Collection','Date'];
    const rows = AppState.items.map(item => {
      const col = AppState.collections.find(c => c.id === item.collection);
      return [
        item.type,
        `"${(item.title||'').replace(/"/g,'""')}"`,
        `"${(item.url||'').replace(/"/g,'""')}"`,
        `"${(item.description||item.content||'').replace(/"/g,'""').substring(0,100)}"`,
        `"${(item.tags||[]).join(', ')}"`,
        item.favorite?'Oui':'Non',
        `"${col?col.name:''}"`,
        new Date(item.createdAt).toLocaleDateString('fr-FR')
      ].join(',');
    });
    this._dl(new Blob(['\ufeff'+[headers.join(','),...rows].join('\n')], { type: 'text/csv;charset=utf-8' }),
      `linkvault-${this._date()}.csv`);
    Toast.show('Export CSV réussi', 'success');
  },

  exportMarkdown() {
    let md = `# LinkVault Export\n_${new Date().toLocaleDateString('fr-FR')}_\n\n`;
    const links = AppState.items.filter(i => i.type==='link');
    const notes = AppState.items.filter(i => i.type==='note');
    if (links.length) {
      md += `## 🔗 Liens (${links.length})\n\n`;
      links.forEach(i => {
        md += `### [${i.title}](${i.url})\n`;
        if (i.description) md += `${i.description}\n`;
        if (i.tags?.length) md += `Tags: ${i.tags.map(t=>`#${t}`).join(' ')}\n`;
        md += `\n`;
      });
    }
    if (notes.length) {
      md += `## 📝 Notes (${notes.length})\n\n`;
      notes.forEach(i => {
        md += `### ${i.title}\n\n${i.content||''}\n\n`;
        if (i.tags?.length) md += `Tags: ${i.tags.map(t=>`#${t}`).join(' ')}\n`;
        md += `---\n\n`;
      });
    }
    this._dl(new Blob([md], { type: 'text/markdown' }), `linkvault-${this._date()}.md`);
    Toast.show('Export Markdown réussi', 'success');
  },

  importJSON(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        const isLV = data.app === 'LinkVault';

        if (!isLV && !data.items && !Array.isArray(data)) {
          Toast.show('Format non reconnu', 'error'); return;
        }

        const sourceItems = isLV ? (data.items || []) : (Array.isArray(data) ? data : (data.items || []));
        const sourceCols  = isLV ? (data.collections || []) : [];

        const merge = confirm(
          `Importer ${sourceItems.length} élément(s) ?\n\nOK = Fusionner\nAnnuler = Remplacer tout`);

        if (merge) {
          const existIds = new Set(AppState.items.map(i => i.id));
          const newItems = sourceItems.filter(i => !existIds.has(i.id));
          AppState.items.push(...newItems);

          const existColIds = new Set(AppState.collections.map(c => c.id));
          sourceCols.filter(c => !existColIds.has(c.id)).forEach(c => AppState.collections.push(c));

          Toast.show(`${newItems.length} éléments fusionnés`, 'success');
        } else {
          AppState.items       = sourceItems;
          AppState.collections = sourceCols;
          AppState.trash       = isLV ? (data.trash || []) : [];
          if (isLV && data.settings) AppState.settings = { ...AppState.settings, ...data.settings };
          Toast.show('Données remplacées', 'success');
        }

        Storage.save();
        UI.updateBadges();
        UI.updateCollectionsList();
        UI.initTheme();
        ContentRenderer.render();
      } catch (err) {
        Toast.show('Erreur import : ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  _dl(blob, name) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  _date() { return new Date().toISOString().split('T')[0]; }
};

// ======= SHARE MANAGER =======
const ShareManager = {
  open(item) {
    AppState.shareItem = item;
    document.getElementById('shareItemInfo').innerHTML = `
      <strong>${Utils.sanitizeHtml(item.title)}</strong>
      ${item.url ? `<br><span style="color:var(--accent);font-size:.8em">${Utils.getDomain(item.url)}</span>` : ''}`;
    document.getElementById('qrContainer').classList.add('hidden');
    Modal.open('modalShare');
  },
  async shareNative(item) {
    if (!item) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text: item.description||'', url: item.url||'' });
        Toast.show('Partagé !', 'success');
      } catch(e) { if (e.name !== 'AbortError') this.copyLink(item); }
    } else { this.copyLink(item); }
  },
  copyLink(item) {
    const text = item?.url || `${item?.title}\n${item?.content?.substring(0,200)||''}`;
    navigator.clipboard.writeText(text)
      .then(() => Toast.show('Copié !', 'success'))
      .catch(() => { /* fallback */ });
  },
  generateQR(item) {
    if (!item?.url) { Toast.show('QR Code pour les liens uniquement', 'info'); return; }
    const c = document.getElementById('qrContainer');
    c.classList.toggle('hidden');
    if (!c.classList.contains('hidden')) Toast.show('QR Code généré', 'info');
  },
  shareWhatsApp(item) {
    window.open(`https://wa.me/?text=${encodeURIComponent((item?.title||'')+' '+(item?.url||''))}`, '_blank');
  },
  shareTelegram(item) {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(item?.url||'')}&text=${encodeURIComponent(item?.title||'')}`, '_blank');
  }
};

// ======= PWA =======
const PWA = {
  init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller)
              Toast.show('Mise à jour dispo ! Rechargez.', 'info', 5000);
          });
        });
      }).catch(console.warn);

      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data.type === 'SHARE_TARGET' && e.data.url)
          Forms.openLink({ url: e.data.url, title: e.data.title||'', type: 'link' });
      });
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      AppState.deferredInstallPrompt = e;
      this.showBanner();
    });

    const p = new URLSearchParams(window.location.search);
    if (p.has('url') || p.has('text')) {
      const u = p.get('url') || p.get('text') || '';
      if (u) {
        setTimeout(() => Forms.openLink({ url: u, title: p.get('title')||'', type: 'link' }), 600);
        window.history.replaceState({}, document.title, '/');
      }
    }
  },

  showBanner() {
    if (localStorage.getItem('lv_install_dismissed')) return;
    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = `
      <img src="icon-192.png" alt="LinkVault"/>
      <div class="install-banner-text">
        <strong>Installer LinkVault</strong>
        <span>Accès rapide depuis l'écran d'accueil</span>
      </div>
      <div class="install-banner-actions">
        <button class="btn btn-small btn-ghost"    id="installDismiss">Ignorer</button>
        <button class="btn btn-small btn-primary"   id="installAccept">Installer</button>
      </div>`;
    document.body.appendChild(banner);

    document.getElementById('installAccept').onclick = async () => {
      if (AppState.deferredInstallPrompt) {
        AppState.deferredInstallPrompt.prompt();
        const r = await AppState.deferredInstallPrompt.userChoice;
        if (r.outcome === 'accepted') Toast.show('LinkVault installé !', 'success');
        AppState.deferredInstallPrompt = null;
      }
      banner.remove();
    };
    document.getElementById('installDismiss').onclick = () => {
      localStorage.setItem('lv_install_dismissed','1');
      banner.remove();
    };
  }
};

// ============================================================
//  INIT EVENTS
// ============================================================
function initEventListeners() {

  // ── Sidebar ──
  document.getElementById('hamburgerBtn').addEventListener('click', () => Sidebar.toggle());
  document.getElementById('sidebarClose').addEventListener('click', () => Sidebar.close());
  document.getElementById('sidebarOverlay').addEventListener('click', () => Sidebar.close());

  // ── Navigation ──
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      AppState.currentView       = view;
      AppState.currentCollection = null;
      AppState.searchQuery       = '';
      document.getElementById('searchInput').value = '';
      document.getElementById('searchClear').style.display = 'none';

      document.querySelectorAll('.nav-item, .collection-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const titles = {
        all:       ['Tableau de bord',   'Tous vos liens et notes'],
        links:     ['Liens',             'Tous vos liens'],
        notes:     ['Notes',             'Toutes vos notes'],
        favorites: ['Favoris',           'Vos éléments favoris'],
        tags:      ['Tags',              'Parcourir par tags'],
        trash:     ['Corbeille',         'Éléments supprimés']
      };
      const [title, sub] = titles[view] || ['LinkVault',''];
      document.getElementById('viewTitle').textContent    = title;
      document.getElementById('viewSubtitle').textContent = sub;

      ContentRenderer.render();
      Sidebar.close();
    });
  });

  // ── FAB ──
  const fabContainer = document.getElementById('fabContainer');
  document.getElementById('fabMain').addEventListener('click', e => {
    e.stopPropagation();
    fabContainer.classList.toggle('open');
  });
  document.getElementById('fabAddLink').addEventListener('click', () => {
    fabContainer.classList.remove('open');
    Forms.openLink();
  });
  document.getElementById('fabAddNote').addEventListener('click', () => {
    fabContainer.classList.remove('open');
    Forms.openNote();
  });
  document.getElementById('fabAddCollection').addEventListener('click', () => {
    fabContainer.classList.remove('open');
    Forms.openCollection();
  });
  document.addEventListener('click', e => {
    if (!fabContainer.contains(e.target)) fabContainer.classList.remove('open');
  });

  // ── Fermeture modals ──
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', () => {
      const m = bd.closest('.modal');
      if (m) Modal.close(m.id);
    });
  });
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    // On exclut les éléments qui n'ont pas data-modal
    if (btn.classList.contains('modal-close') || btn.hasAttribute('data-modal')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.modal || btn.closest('.modal')?.id;
        if (id) Modal.close(id);
      });
    }
  });

  // ── Lien : Sauvegarder ──
  document.getElementById('btnSaveLink').addEventListener('click', () => Forms.saveLink());
  document.getElementById('linkUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('linkTitle').focus(); }
  });
  document.getElementById('linkTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); Forms.saveLink(); }
  });

  // ── Note : Sauvegarder ──
  document.getElementById('btnSaveNote').addEventListener('click', () => Forms.saveNote());

  // ── Fetch meta ──
  document.getElementById('btnFetchMeta').addEventListener('click', () => Forms.fetchMeta());

  // ── Collection ──
  document.getElementById('btnSaveCollection').addEventListener('click', () => Forms.saveCollection());
  document.getElementById('btnAddCollection').addEventListener('click', () => Forms.openCollection());
  document.getElementById('collectionName').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); Forms.saveCollection(); }
  });

  // ── Color pickers (délégation générique) ──
  ['linkColorPicker', 'noteColorPicker', 'collectionColorPicker'].forEach(pickerId => {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    const colorKey = pickerId.includes('link') ? 'link'
                   : pickerId.includes('note') ? 'note' : 'collection';
    picker.addEventListener('click', e => {
      const opt = e.target.closest('.color-option');
      if (!opt) return;
      AppState.selectedColor[colorKey] = opt.dataset.color;
      picker.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  // ── Icon picker collection ──
  document.getElementById('collectionIconPicker')?.addEventListener('click', e => {
    const opt = e.target.closest('.icon-option');
    if (!opt) return;
    AppState.selectedIcon = opt.dataset.icon;
    document.querySelectorAll('#collectionIconPicker .icon-option')
      .forEach(o => o.classList.toggle('active', o === opt));
  });

  // ── Note toolbar ──
  document.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ta    = document.getElementById('noteContent');
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const sel   = ta.value.substring(start, end);
      const map   = {
        bold:      `**${sel||'texte'}**`,
        italic:    `*${sel||'texte'}*`,
        underline: `_${sel||'texte'}_`,
        h1:        `\n# ${sel||'Titre 1'}\n`,
        h2:        `\n## ${sel||'Titre 2'}\n`,
        ul:        `\n- ${sel||'Élément'}\n`,
        ol:        `\n1. ${sel||'Élément'}\n`,
        checklist: `\n- [ ] ${sel||'Tâche'}\n`,
        code:      `\`${sel||'code'}\``,
        quote:     `\n> ${sel||'Citation'}\n`,
        link:      `[${sel||'texte'}](url)`
      };
      const repl = map[btn.dataset.format] || sel;
      ta.value   = ta.value.substring(0, start) + repl + ta.value.substring(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + repl.length;
      Forms.updateWordCount();
    });
  });

  // ── Preview toggle ──
  document.getElementById('btnNotePreview').addEventListener('click', () => {
    const ta      = document.getElementById('noteContent');
    const preview = document.getElementById('notePreview');
    const btn     = document.getElementById('btnNotePreview');
    if (preview.classList.contains('hidden')) {
      preview.innerHTML = Utils.parseMarkdown(ta.value || '_Aucun contenu_');
      preview.classList.remove('hidden');
      ta.classList.add('hidden');
      btn.classList.add('active');
    } else {
      preview.classList.add('hidden');
      ta.classList.remove('hidden');
      btn.classList.remove('active');
    }
  });

  document.getElementById('noteContent').addEventListener('input', () => Forms.updateWordCount());

  // ── Fullscreen note ──
  document.getElementById('btnNoteFullscreen').addEventListener('click', () => {
    const modal = document.getElementById('modalNote');
    modal.classList.toggle('fullscreen');
    document.querySelector('#btnNoteFullscreen .material-icons-outlined').textContent =
      modal.classList.contains('fullscreen') ? 'fullscreen_exit' : 'fullscreen';
  });

  // ── Search ──
  document.getElementById('btnSearch').addEventListener('click', () => {
    document.getElementById('searchContainer').classList.toggle('visible');
    if (document.getElementById('searchContainer').classList.contains('visible'))
      document.getElementById('searchInput').focus();
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    AppState.searchQuery = e.target.value;
    document.getElementById('searchClear').style.display = e.target.value ? 'flex' : 'none';
    ContentRenderer.render();
  });

  document.getElementById('searchClear').addEventListener('click', () => {
    AppState.searchQuery = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    ContentRenderer.render();
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      AppState.currentFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ContentRenderer.render();
    });
  });

  // ── Sort ──
  document.getElementById('btnSort').addEventListener('click', () => {
    document.querySelectorAll('input[name="sortBy"]').forEach(r => {
      r.checked = r.value === AppState.settings.sortBy;
    });
    Modal.open('modalSort');
  });
  document.getElementById('btnApplySort').addEventListener('click', () => {
    const sel = document.querySelector('input[name="sortBy"]:checked');
    if (sel) {
      AppState.settings.sortBy = sel.value;
      Storage.save();
      ContentRenderer.render();
      Modal.close('modalSort');
    }
  });

  // ── Toggle vue grille/liste ──
  document.getElementById('btnToggleView').addEventListener('click', () => {
    AppState.isGridView = !AppState.isGridView;
    document.querySelector('#btnToggleView .material-icons-outlined').textContent =
      AppState.isGridView ? 'grid_view' : 'view_list';
    ContentRenderer.render();
  });

  // ── Thème ──
  document.getElementById('themeToggle').addEventListener('click', () => UI.toggleTheme());

  // ── Paramètres ──
  document.getElementById('btnSettings').addEventListener('click', () => Modal.open('modalSettings'));

  document.getElementById('settingDarkMode').addEventListener('change', e => {
    AppState.settings.theme = e.target.checked ? 'dark' : 'light';
    UI.initTheme();
    Storage.save();
  });
  document.getElementById('settingDefaultView').addEventListener('change', e => {
    AppState.settings.defaultView = e.target.value;
    Storage.save();
  });

  // Accent dans settings
  document.querySelectorAll('[id^="accentColor"]').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.settings.accentColor = btn.dataset.color;
      document.querySelectorAll('[id^="accentColor"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      UI.initTheme();
      Storage.save();
    });
  });

  // ── Export/Import ──
  document.getElementById('exportJSON').addEventListener('click', () => DataManager.exportJSON());
  document.getElementById('exportCSV').addEventListener('click', ()  => DataManager.exportCSV());
  document.getElementById('exportMD').addEventListener('click',  () => DataManager.exportMarkdown());
  document.getElementById('btnExport').addEventListener('click', () => DataManager.exportJSON());

  const importInput = document.getElementById('importFileInput');
  ['importDataBtn','btnImport'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => importInput.click());
  });
  importInput.addEventListener('change', e => {
    if (e.target.files[0]) { DataManager.importJSON(e.target.files[0]); importInput.value = ''; }
  });

  // ── Corbeille / Reset ──
  document.getElementById('emptyTrashBtn').addEventListener('click', () => {
    if (!AppState.trash.length) { Toast.show('Corbeille vide', 'info'); return; }
    if (confirm(`Supprimer définitivement ${AppState.trash.length} élément(s) ?`)) {
      AppState.trash = [];
      Storage.save();
      UI.updateBadges();
      Toast.show('Corbeille vidée', 'success');
    }
  });
  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (confirm('⚠️ Supprimer TOUTES vos données ?')) {
      if (confirm('Dernière confirmation ?')) {
        AppState.items = []; AppState.collections = []; AppState.trash = [];
        localStorage.clear();
        Storage.save();
        UI.updateBadges();
        UI.updateCollectionsList();
        ContentRenderer.render();
        Modal.close('modalSettings');
        Toast.show('Réinitialisé', 'warning');
      }
    }
  });

  // ── Sync guide ──
  document.getElementById('btnSyncGuide').addEventListener('click', () => {
    Modal.close('modalSettings');
    Modal.open('modalSyncGuide');
  });

  // ── Share modal ──
  document.getElementById('shareNative').addEventListener('click', () => {
    ShareManager.shareNative(AppState.shareItem);
    Modal.close('modalShare');
  });
  document.getElementById('shareCopyLink').addEventListener('click', () => {
    ShareManager.copyLink(AppState.shareItem);
    Modal.close('modalShare');
  });
  document.getElementById('shareQR').addEventListener('click', () =>
    ShareManager.generateQR(AppState.shareItem));
  document.getElementById('shareWhatsApp').addEventListener('click', () => {
    ShareManager.shareWhatsApp(AppState.shareItem);
    Modal.close('modalShare');
  });
  document.getElementById('shareTelegram').addEventListener('click', () => {
    ShareManager.shareTelegram(AppState.shareItem);
    Modal.close('modalShare');
  });

  // ── Raccourcis clavier ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { Modal.closeAll(); fabContainer.classList.remove('open'); }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'l') { e.preventDefault(); Forms.openLink(); }
      if (e.key === 'n') { e.preventDefault(); Forms.openNote(); }
      if (e.key === 'f') { e.preventDefault(); document.getElementById('searchContainer').classList.add('visible'); document.getElementById('searchInput').focus(); }
      if (e.key === 's') { e.preventDefault(); DataManager.exportJSON(); }
    }
  });

  // ── Drag & Drop URL ──
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (document.querySelector('.modal.open')) return;
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (text && /^https?:\/\//i.test(text)) Forms.openLink({ url: text, title: Utils.getDomain(text) });
  });
}

// ======= CSS additionnel injecté =======
const EXTRA_CSS = `
  .modal.fullscreen .modal-container {
    max-width: 100vw !important; width: 100vw !important;
    height: 100vh !important; max-height: 100vh !important;
    border-radius: 0 !important;
  }

  /* Wrapper tags avec bouton + pour mobile */
  .tags-input-wrapper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tags-input-wrapper .tags-input-container { flex: 1; }

  .btn-tag-add {
    width: 40px; height: 40px;
    background: var(--accent-light);
    color: var(--accent);
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    font-size: 22px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .btn-tag-add:hover { background: var(--accent); color: white; }
  .btn-tag-add .material-icons-outlined { font-size: 20px !important; }

  /* Card actions visibles sur mobile */
  @media (max-width: 768px) {
    .card-actions { opacity: 1 !important; }
  }

  /* Collection modal title */
  #modalCollectionTitle {
    display: flex; align-items: center; gap: 10px; font-size: 1.1rem; font-weight: 700;
  }
  #modalCollectionTitle .material-icons-outlined { color: var(--accent); font-size: 22px !important; }
`;

const styleEl = document.createElement('style');
styleEl.textContent = EXTRA_CSS;
document.head.appendChild(styleEl);

// ======= DONNÉES DEMO =======
function loadDemoData() {
  if (AppState.items.length > 0) return;
  const col = { id: 'demo_col_1', name: 'Développement', icon: 'code', color: '#6c63ff' };
  AppState.collections.push(col);
  AppState.items = [
    {
      id:'demo_1', type:'link', url:'https://developer.mozilla.org',
      title:'MDN Web Docs', description:'La référence complète pour les développeurs web.',
      collection:'demo_col_1', favorite:true, tags:['dev','documentation'],
      color:'#6c63ff', createdAt:Date.now()-86400000*3, updatedAt:Date.now()-86400000*3
    },
    {
      id:'demo_2', type:'link', url:'https://github.com',
      title:'GitHub', description:'Le plus grand réseau de développeurs.',
      collection:'demo_col_1', favorite:false, tags:['dev','git'],
      color:'#43d9ad', createdAt:Date.now()-86400000*2, updatedAt:Date.now()-86400000*2
    },
    {
      id:'demo_3', type:'note',
      title:'Bienvenue dans LinkVault 🎉',
      content:`# Bienvenue !\n\n## Ajouter des tags\n- Tapez un mot puis **virgule**, **espace** ou **;**\n- Ou utilisez le bouton **+** sur mobile\n- Supprimez un tag avec la croix ×\n\n## Raccourcis\n- \`Ctrl+L\` Nouveau lien\n- \`Ctrl+N\` Nouvelle note\n- \`Ctrl+F\` Rechercher\n- \`Ctrl+S\` Exporter`,
      pinned:true, favorite:true, tags:['aide','bienvenue'],
      color:'#43d9ad', createdAt:Date.now()-86400000, updatedAt:Date.now()-86400000
    }
  ];
  Storage.save();
}

// ======= PATCH HTML : ajouter id manquant dans la modal Collection =======
function patchModalCollection() {
  const h2 = document.querySelector('#modalCollection .modal-header h2');
  if (h2 && !h2.id) h2.id = 'modalCollectionTitle';
}

// ======= PATCH HTML : ajouter bouton + pour tags ── inject dans le DOM =======
function patchTagInputs() {
  ['link','note'].forEach(type => {
    const container = document.getElementById(`${type}TagsDisplay`)?.closest('.tags-input-container');
    if (!container) return;
    const parent = container.parentElement;
    // Si pas encore wrappé
    if (!parent.classList.contains('tags-input-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'tags-input-wrapper';
      parent.insertBefore(wrapper, container);
      wrapper.appendChild(container);

      const addBtn = document.createElement('button');
      addBtn.type      = 'button';
      addBtn.id        = `${type}TagsAdd`;
      addBtn.className = 'btn-tag-add';
      addBtn.title     = 'Ajouter le tag';
      addBtn.innerHTML = '<span class="material-icons-outlined">add</span>';
      wrapper.appendChild(addBtn);
    }
  });
}

// ======= INIT =======
function init() {
  Storage.load();
  loadDemoData();
  patchModalCollection();
  patchTagInputs();
  UI.initTheme();
  UI.updateBadges();
  UI.updateCollectionsList();
  UI.updateStorageInfo();
  ContentRenderer.render();
  initEventListeners();
  PWA.init();
  console.log('✅ LinkVault v2.1 — OK');
}

document.addEventListener('DOMContentLoaded', init);
// ============================================================
// PROMPT MANAGER — Application Logic
// ============================================================
// Vanilla JS — No frameworks required
// Connects to Google Apps Script Web App via fetch()
// ============================================================

(function () {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    prompts: [],
    filteredPrompts: [],
    categories: [],
    currentEditId: null,
    deleteTargetId: null,
    scriptUrl: localStorage.getItem('promptManagerUrl') || '',
    isLoading: false,
  };

  // ============================================================
  // DOM REFERENCES
  // ============================================================
  const $ = (id) => document.getElementById(id);

  const dom = {
    // Sections
    toolbar: $('toolbar'),
    statsBar: $('stats-bar'),
    mainContent: $('main-content'),
    setupScreen: $('setup-screen'),
    loadingState: $('loading-state'),
    errorState: $('error-state'),
    emptyState: $('empty-state'),
    cardsGrid: $('cards-grid'),

    // Header
    themeToggle: $('theme-toggle'),
    btnSettings: $('btn-settings'),

    // Toolbar
    searchInput: $('search-input'),
    categoryFilter: $('category-filter'),
    btnNew: $('btn-new'),

    // Stats
    statTotal: $('stat-total'),
    statCategories: $('stat-categories'),
    statFiltered: $('stat-filtered'),
    statFilteredWrapper: $('stat-filtered-wrapper'),

    // Setup
    setupUrlInput: $('setup-url-input'),
    setupConnectBtn: $('setup-connect-btn'),

    // Error
    errorMessage: $('error-message'),
    btnRetry: $('btn-retry'),

    // Empty
    btnEmptyNew: $('btn-empty-new'),

    // Modal
    modalOverlay: $('modal-overlay'),
    modalTitle: $('modal-title'),
    modalClose: $('modal-close'),
    promptForm: $('prompt-form'),
    formId: $('form-id'),
    formCategoria: $('form-categoria'),
    formNombre: $('form-nombre'),
    formPrompt: $('form-prompt'),
    formEjemplos: $('form-ejemplos'),
    btnFormCancel: $('btn-form-cancel'),
    btnFormSubmit: $('btn-form-submit'),
    categoriasDatalist: $('categorias-datalist'),

    // Confirm
    confirmOverlay: $('confirm-overlay'),
    confirmCancel: $('confirm-cancel'),
    confirmDelete: $('confirm-delete'),

    // Settings modal
    settingsOverlay: $('settings-overlay'),
    settingsClose: $('settings-close'),
    settingsUrlInput: $('settings-url-input'),
    btnSettingsCancel: $('btn-settings-cancel'),
    btnSettingsSubmit: $('btn-settings-submit'),

    // Toast
    toastContainer: $('toast-container'),
  };

  // ============================================================
  // THEME
  // ============================================================
  function loadTheme() {
    const saved = localStorage.getItem('promptManagerTheme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('promptManagerTheme', next);
  }

  // ============================================================
  // API — Communication with Google Apps Script
  // ============================================================

  /**
   * GET request to the Web App.
   */
  async function apiGet(action) {
    const url = `${state.scriptUrl}?action=${encodeURIComponent(action)}`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * POST request to the Web App.
   * Uses Content-Type: text/plain to avoid CORS preflight.
   */
  async function apiPost(data) {
    const response = await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  // ============================================================
  // CRUD OPERATIONS
  // ============================================================

  async function fetchPrompts() {
    showView('loading');
    try {
      const result = await apiGet('read');
      if (result.status === 'success') {
        state.prompts = result.data;
        extractCategories();
        applyFilters();
        showView(state.prompts.length === 0 ? 'empty' : 'cards');
      } else {
        throw new Error(result.message || 'Error desconocido');
      }
    } catch (error) {
      console.error('fetchPrompts error:', error);
      showView('error', error.message);
    }
  }

  async function createPrompt(data) {
    dom.btnFormSubmit.disabled = true;
    dom.btnFormSubmit.textContent = 'Guardando...';
    try {
      const result = await apiPost({
        action: 'create',
        categoria: data.categoria,
        nombre: data.nombre,
        prompt: data.prompt,
        ejemplos: data.ejemplos,
      });
      if (result.status === 'success') {
        showToast('Prompt creado exitosamente', 'success');
        closeModal();
        await fetchPrompts();
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      showToast('Error al crear: ' + error.message, 'error');
    } finally {
      dom.btnFormSubmit.disabled = false;
      dom.btnFormSubmit.textContent = 'Guardar';
    }
  }

  async function updatePrompt(data) {
    dom.btnFormSubmit.disabled = true;
    dom.btnFormSubmit.textContent = 'Actualizando...';
    try {
      const result = await apiPost({
        action: 'update',
        id: data.id,
        categoria: data.categoria,
        nombre: data.nombre,
        prompt: data.prompt,
        ejemplos: data.ejemplos,
      });
      if (result.status === 'success') {
        showToast('Prompt actualizado exitosamente', 'success');
        closeModal();
        await fetchPrompts();
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      showToast('Error al actualizar: ' + error.message, 'error');
    } finally {
      dom.btnFormSubmit.disabled = false;
      dom.btnFormSubmit.textContent = 'Guardar';
    }
  }

  async function deletePrompt(id) {
    dom.confirmDelete.disabled = true;
    dom.confirmDelete.textContent = 'Eliminando...';
    try {
      const result = await apiPost({ action: 'delete', id: id });
      if (result.status === 'success') {
        showToast('Prompt eliminado', 'success');
        closeConfirm();
        await fetchPrompts();
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      showToast('Error al eliminar: ' + error.message, 'error');
    } finally {
      dom.confirmDelete.disabled = false;
      dom.confirmDelete.textContent = 'Eliminar';
    }
  }

  // ============================================================
  // FILTERING & SEARCH
  // ============================================================

  function extractCategories() {
    const cats = new Set();
    state.prompts.forEach((p) => {
      const cat = (p['Categoría'] || '').trim();
      if (cat) cats.add(cat);
    });
    state.categories = [...cats].sort();
    renderCategoryFilter();
    renderCategoryDatalist();
  }

  function applyFilters() {
    const query = dom.searchInput.value.toLowerCase().trim();
    const category = dom.categoryFilter.value;

    state.filteredPrompts = state.prompts.filter((p) => {
      // Category filter
      if (category && (p['Categoría'] || '') !== category) return false;

      // Text search
      if (query) {
        const searchable = [
          p['Categoría'] || '',
          p['Nombre prompt'] || '',
          p['Prompt'] || '',
          p['Ejemplos'] || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }

      return true;
    });

    renderCards();
    updateStats();
  }

  // ============================================================
  // RENDERING
  // ============================================================

  function renderCards() {
    const grid = dom.cardsGrid;
    grid.innerHTML = '';

    if (state.filteredPrompts.length === 0 && state.prompts.length > 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3>Sin resultados</h3>
          <p>No se encontraron prompts con los filtros actuales.</p>
        </div>
      `;
      return;
    }

    state.filteredPrompts.forEach((prompt) => {
      const card = createCardElement(prompt);
      grid.appendChild(card);
    });

    // After render, check which cards need "expand" buttons
    requestAnimationFrame(() => {
      grid.querySelectorAll('.card-prompt-text').forEach((el) => {
        const expandBtn = el.nextElementSibling;
        if (el.scrollHeight > el.clientHeight + 2) {
          expandBtn.classList.add('visible');
        }
      });
    });
  }

  function createCardElement(prompt) {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.dataset.id = prompt['ID'];

    const categoria = escapeHtml(prompt['Categoría'] || 'Sin categoría');
    const nombre = escapeHtml(prompt['Nombre prompt'] || 'Sin nombre');
    const promptText = escapeHtml(prompt['Prompt'] || '');
    const ejemplos = escapeHtml(prompt['Ejemplos'] || '');
    const fecha = prompt['Fecha'] ? escapeHtml(prompt['Fecha']) : '';

    let fechaMostrada = '';
    if (fecha) {
      fechaMostrada = fecha.includes(' ') ? fecha.split(' ')[0] : fecha;
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="card-header-meta">
          <span class="card-badge">${categoria}</span>
          ${fechaMostrada ? `
            <span class="card-date" title="Añadido el: ${fecha}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${fechaMostrada}
            </span>
          ` : ''}
        </div>
        <div class="card-actions">
          <button class="btn-icon btn-edit" title="Editar" data-id="${prompt['ID']}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-icon-danger btn-delete" title="Eliminar" data-id="${prompt['ID']}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
      <div class="card-title">${nombre}</div>
      <div class="card-body">
        <div class="card-prompt-text">${promptText}</div>
        <button class="card-expand-btn" type="button">Ver más</button>
      </div>
      ${
        ejemplos
          ? `<div class="card-footer">
              <div class="card-footer-label">Ejemplos</div>
              <div class="card-footer-text">${ejemplos}</div>
            </div>`
          : ''
      }
    `;

    // Event: Edit
    card.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openModalEdit(prompt);
    });

    // Event: Delete
    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      openConfirm(prompt['ID']);
    });

    // Event: Expand text
    const expandBtn = card.querySelector('.card-expand-btn');
    const textEl = card.querySelector('.card-prompt-text');
    expandBtn.addEventListener('click', () => {
      const isExpanded = textEl.classList.toggle('expanded');
      expandBtn.textContent = isExpanded ? 'Ver menos' : 'Ver más';
    });

    return card;
  }

  function renderCategoryFilter() {
    const select = dom.categoryFilter;
    const currentValue = select.value;
    select.innerHTML = '<option value="">Todas las categorías</option>';
    state.categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      select.appendChild(option);
    });
    select.value = currentValue;
  }

  function renderCategoryDatalist() {
    const datalist = dom.categoriasDatalist;
    datalist.innerHTML = '';
    state.categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      datalist.appendChild(option);
    });
  }

  function updateStats() {
    dom.statTotal.textContent = state.prompts.length;
    dom.statCategories.textContent = state.categories.length;

    const isFiltered =
      dom.searchInput.value.trim() !== '' || dom.categoryFilter.value !== '';
    dom.statFilteredWrapper.style.display = isFiltered ? 'flex' : 'none';
    dom.statFiltered.textContent = state.filteredPrompts.length;
  }

  // ============================================================
  // VIEW MANAGEMENT
  // ============================================================

  function showView(view, errorMsg) {
    // Hide all
    dom.setupScreen.style.display = 'none';
    dom.loadingState.style.display = 'none';
    dom.errorState.style.display = 'none';
    dom.emptyState.style.display = 'none';
    dom.cardsGrid.style.display = 'none';
    dom.toolbar.style.display = 'none';
    dom.statsBar.style.display = 'none';

    switch (view) {
      case 'setup':
        dom.setupScreen.style.display = 'flex';
        break;
      case 'loading':
        dom.loadingState.style.display = 'flex';
        break;
      case 'error':
        dom.errorState.style.display = 'flex';
        if (errorMsg) dom.errorMessage.textContent = errorMsg;
        break;
      case 'empty':
        dom.toolbar.style.display = 'block';
        dom.statsBar.style.display = 'flex';
        dom.emptyState.style.display = 'flex';
        break;
      case 'cards':
        dom.toolbar.style.display = 'block';
        dom.statsBar.style.display = 'flex';
        dom.cardsGrid.style.display = 'grid';
        break;
    }
  }

  // ============================================================
  // MODAL
  // ============================================================

  function openModalCreate() {
    state.currentEditId = null;
    dom.modalTitle.textContent = 'Nuevo Prompt';
    dom.btnFormSubmit.textContent = 'Guardar';
    dom.formId.value = '';
    dom.formCategoria.value = '';
    dom.formNombre.value = '';
    dom.formPrompt.value = '';
    dom.formEjemplos.value = '';
    dom.modalOverlay.classList.add('active');
    dom.formCategoria.focus();
  }

  function openModalEdit(prompt) {
    state.currentEditId = prompt['ID'];
    dom.modalTitle.textContent = 'Editar Prompt';
    dom.btnFormSubmit.textContent = 'Actualizar';
    dom.formId.value = prompt['ID'];
    dom.formCategoria.value = prompt['Categoría'] || '';
    dom.formNombre.value = prompt['Nombre prompt'] || '';
    dom.formPrompt.value = prompt['Prompt'] || '';
    dom.formEjemplos.value = prompt['Ejemplos'] || '';
    dom.modalOverlay.classList.add('active');
    dom.formCategoria.focus();
  }

  function closeModal() {
    dom.modalOverlay.classList.remove('active');
    state.currentEditId = null;
    dom.promptForm.reset();
  }

  // ============================================================
  // CONFIRM DIALOG
  // ============================================================

  function openConfirm(id) {
    state.deleteTargetId = id;
    dom.confirmOverlay.classList.add('active');
  }

  function closeConfirm() {
    dom.confirmOverlay.classList.remove('active');
    state.deleteTargetId = null;
  }

  // ============================================================
  // TOAST NOTIFICATIONS
  // ============================================================

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSvg =
      type === 'success'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    `;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  // SETUP / CONNECTION
  // ============================================================

  function connectUrl(url) {
    url = url.trim();
    if (!url) {
      showToast('Por favor ingresa una URL válida', 'error');
      return false;
    }
    if (!url.startsWith('https://script.google.com/')) {
      showToast('La URL debe comenzar con https://script.google.com/', 'error');
      return false;
    }
    state.scriptUrl = url;
    localStorage.setItem('promptManagerUrl', url);
    fetchPrompts();
    return true;
  }

  function openSettings() {
    dom.settingsUrlInput.value = state.scriptUrl;
    dom.settingsOverlay.classList.add('active');
    dom.settingsUrlInput.focus();
  }

  function closeSettings() {
    dom.settingsOverlay.classList.remove('active');
  }

  // ============================================================
  // EVENT BINDING
  // ============================================================

  function bindEvents() {
    // Theme
    dom.themeToggle.addEventListener('click', toggleTheme);

    // Settings
    dom.btnSettings.addEventListener('click', openSettings);

    // Settings modal events
    dom.settingsClose.addEventListener('click', closeSettings);
    dom.btnSettingsCancel.addEventListener('click', closeSettings);
    dom.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === dom.settingsOverlay) closeSettings();
    });
    dom.btnSettingsSubmit.addEventListener('click', () => {
      if (connectUrl(dom.settingsUrlInput.value)) {
        closeSettings();
      }
    });
    dom.settingsUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (connectUrl(dom.settingsUrlInput.value)) {
          closeSettings();
        }
      }
    });

    // Setup
    dom.setupConnectBtn.addEventListener('click', () => {
      connectUrl(dom.setupUrlInput.value);
    });
    dom.setupUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        connectUrl(dom.setupUrlInput.value);
      }
    });

    // New prompt buttons
    dom.btnNew.addEventListener('click', openModalCreate);
    dom.btnEmptyNew.addEventListener('click', openModalCreate);

    // Search & filter
    let searchTimeout;
    dom.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFilters, 200);
    });
    dom.categoryFilter.addEventListener('change', applyFilters);

    // Modal
    dom.modalClose.addEventListener('click', closeModal);
    dom.btnFormCancel.addEventListener('click', closeModal);
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });

    // Form submit
    dom.promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        categoria: dom.formCategoria.value.trim(),
        nombre: dom.formNombre.value.trim(),
        prompt: dom.formPrompt.value.trim(),
        ejemplos: dom.formEjemplos.value.trim(),
      };

      if (state.currentEditId) {
        data.id = state.currentEditId;
        updatePrompt(data);
      } else {
        createPrompt(data);
      }
    });

    // Confirm dialog
    dom.confirmCancel.addEventListener('click', closeConfirm);
    dom.confirmDelete.addEventListener('click', () => {
      if (state.deleteTargetId) {
        deletePrompt(state.deleteTargetId);
      }
    });
    dom.confirmOverlay.addEventListener('click', (e) => {
      if (e.target === dom.confirmOverlay) closeConfirm();
    });

    // Retry
    dom.btnRetry.addEventListener('click', fetchPrompts);

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (dom.modalOverlay.classList.contains('active')) closeModal();
        if (dom.confirmOverlay.classList.contains('active')) closeConfirm();
        if (dom.settingsOverlay.classList.contains('active')) closeSettings();
      }
    });
  }

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    loadTheme();
    bindEvents();

    if (state.scriptUrl) {
      fetchPrompts();
    } else {
      showView('setup');
    }
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

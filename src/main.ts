import './style.css'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Supabase ──
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase: SupabaseClient | null =
    (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url')
        ? createClient(supabaseUrl, supabaseAnonKey)
        : null;

// ── Types ──
type DictionaryEntry = {
    id: string;
    word: string;
    target_word: string;
    created_at: string;
};

// ── DOM Refs ──
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const searchInput = $<HTMLInputElement>('search-input');
const searchKbd = $<HTMLElement>('search-kbd');
const searchClear = $<HTMLButtonElement>('search-clear');
const themeToggle = $<HTMLButtonElement>('theme-toggle');
const dictionaryContent = $<HTMLDivElement>('dictionary-content');
const listLoader = $<HTMLDivElement>('list-loader');
const emptyState = $<HTMLDivElement>('empty-state');
const emptyText = $<HTMLParagraphElement>('empty-text');
const statTotal = $<HTMLDivElement>('stat-total');
const statFiltered = $<HTMLDivElement>('stat-filtered');
const pagination = $<HTMLDivElement>('pagination');

const btnListView = $<HTMLButtonElement>('btn-list-view');
const btnGridView = $<HTMLButtonElement>('btn-grid-view');

const fabContainer = $<HTMLDivElement>('fab-container');
const fabMain = $<HTMLButtonElement>('fab-main');
const fabNewWord = $<HTMLButtonElement>('fab-new-word');
const fabSettings = $<HTMLButtonElement>('fab-settings');

const drawer = $<HTMLElement>('add-drawer');
const settingsDrawer = $<HTMLElement>('settings-drawer');
const settingsClose = $<HTMLButtonElement>('settings-close');
const settingsForm = $<HTMLFormElement>('settings-form');
const limitInput = $<HTMLInputElement>('limit-input');

const drawerOverlay = $<HTMLDivElement>('drawer-overlay');
const drawerClose = $<HTMLButtonElement>('drawer-close');
const addWordForm = $<HTMLFormElement>('add-word-form');
const typoInput = $<HTMLInputElement>('typo-input');
const correctInput = $<HTMLInputElement>('correct-input');
const submitBtn = $<HTMLButtonElement>('submit-btn');
const submitLoader = $<HTMLDivElement>('submit-loader');

const editDrawer = $<HTMLElement>('edit-drawer');
const editClose = $<HTMLButtonElement>('edit-close');
const editWordForm = $<HTMLFormElement>('edit-word-form');
const editTypoInput = $<HTMLInputElement>('edit-typo-input');
const editCorrectInput = $<HTMLInputElement>('edit-correct-input');
const editSubmitBtn = $<HTMLButtonElement>('edit-submit-btn');
const editSubmitLoader = $<HTMLDivElement>('edit-submit-loader');

const deleteModal = $<HTMLDivElement>('delete-modal');
const deleteWord = $<HTMLElement>('delete-word');
const deleteCancel = $<HTMLButtonElement>('delete-cancel');
const deleteConfirm = $<HTMLButtonElement>('delete-confirm');

const toastContainer = $<HTMLDivElement>('toast-container');

// ── State ──
let currentEntries: DictionaryEntry[] = [];
let pendingDeleteId: string | null = null;
let pendingEditId: string | null = null;
let entriesShown = parseInt(localStorage.getItem('yuri-limit') || '25', 10);
let currentPage = 1;

// ── Theme & View Init ──
function initTheme() {
    const savedTheme = localStorage.getItem('yuri-theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

function initView() {
    const savedView = localStorage.getItem('yuri-view');
    if (savedView === 'grid') {
        dictionaryContent.classList.add('grid-mode');
        btnGridView.classList.add('active');
        btnListView.classList.remove('active');
    }
}

// ── Init ──
async function init() {
    initTheme();
    initView();
    if (!supabase) {
        showToast('Missing Supabase credentials. Check your .env file.', 'error');
        listLoader.classList.remove('active');
        return;
    }

    setupListeners();
    await fetchDictionary();
}

// ── Event Listeners ──
function setupListeners() {
    // Search
    let searchTimeout: ReturnType<typeof setTimeout>;
    searchInput.addEventListener('input', () => {
        searchClear.classList.toggle('visible', searchInput.value.length > 0);
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            renderList(searchInput.value.trim().toLowerCase());
        }, 150);
    });

    // Search clear
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.remove('visible');
        if (document.activeElement !== searchInput) searchKbd.style.display = '';
        currentPage = 1;
        renderList();
        searchInput.focus();
    });

    // Theme toggle
    themeToggle.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('yuri-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('yuri-theme', 'light');
        }
    });

    // View toggles
    btnListView.addEventListener('click', () => {
        dictionaryContent.classList.remove('grid-mode');
        btnListView.classList.add('active');
        btnGridView.classList.remove('active');
        localStorage.setItem('yuri-view', 'list');
    });

    btnGridView.addEventListener('click', () => {
        dictionaryContent.classList.add('grid-mode');
        btnGridView.classList.add('active');
        btnListView.classList.remove('active');
        localStorage.setItem('yuri-view', 'grid');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // "/" focuses search
        if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== typoInput && document.activeElement !== correctInput) {
            e.preventDefault();
            searchInput.focus();
        }
        // "n" opens drawer
        if (e.key === 'n' && !drawer.classList.contains('open') && document.activeElement === document.body) {
            openDrawer();
        }
        // Escape closes drawer or modal
        if (e.key === 'Escape') {
            if (!deleteModal.classList.contains('hidden')) {
                closeDeleteModal();
            } else if (drawer.classList.contains('open')) {
                closeDrawer();
            } else if (editDrawer.classList.contains('open')) {
                closeEditDrawer();
            } else if (settingsDrawer.classList.contains('open')) {
                closeSettings();
            } else if (fabContainer.classList.contains('open')) {
                toggleFabMenu();
            }
        }
    });

    // Hide kbd hint when focused
    searchInput.addEventListener('focus', () => searchKbd.style.display = 'none');
    searchInput.addEventListener('blur', () => {
        if (!searchInput.value) {
            searchKbd.style.display = '';
            searchClear.classList.remove('visible');
        }
    });

    // FAB / Drawer
    fabMain.addEventListener('click', toggleFabMenu);
    fabNewWord.addEventListener('click', () => {
        toggleFabMenu();
        openDrawer();
    });
    fabSettings.addEventListener('click', () => {
        toggleFabMenu();
        openSettings();
    });

    drawerOverlay.addEventListener('click', () => {
        closeDrawer();
        closeSettings();
        closeEditDrawer();
    });
    drawerClose.addEventListener('click', closeDrawer);
    settingsClose.addEventListener('click', closeSettings);
    editClose.addEventListener('click', closeEditDrawer);

    // Forms
    addWordForm.addEventListener('submit', handleAddWord);
    editWordForm.addEventListener('submit', handleEditWord);
    settingsForm.addEventListener('submit', handleSaveSettings);

    // Delete modal
    deleteCancel.addEventListener('click', closeDeleteModal);
    deleteConfirm.addEventListener('click', handleDeleteConfirm);
}

// ── FAB & Drawers ──
function toggleFabMenu() {
    fabContainer.classList.toggle('open');
}

function openDrawer() {
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => typoInput.focus(), 350);
}

function closeDrawer() {
    drawer.classList.remove('open');
    if (!settingsDrawer.classList.contains('open') && !editDrawer.classList.contains('open')) {
        drawerOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function openEditDrawer(id: string, typo: string, correct: string) {
    pendingEditId = id;
    editTypoInput.value = typo;
    editCorrectInput.value = correct;
    editDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => editTypoInput.focus(), 350);
}

function closeEditDrawer() {
    editDrawer.classList.remove('open');
    pendingEditId = null;
    if (!drawer.classList.contains('open') && !settingsDrawer.classList.contains('open')) {
        drawerOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function openSettings() {
    limitInput.value = entriesShown.toString();
    settingsDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSettings() {
    settingsDrawer.classList.remove('open');
    if (!drawer.classList.contains('open')) {
        drawerOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }
}

async function handleSaveSettings(e: SubmitEvent) {
    e.preventDefault();
    const newLimit = parseInt(limitInput.value, 10);
    if (isNaN(newLimit) || newLimit < 1) return;

    entriesShown = newLimit;
    localStorage.setItem('yuri-limit', newLimit.toString());
    currentPage = 1;
    closeSettings();
    renderList(searchInput.value.trim().toLowerCase());
    showToast(`Showing up to ${newLimit} entries`, 'success');
}

// ── Fetch ──
async function fetchDictionary() {
    if (!supabase) return;

    listLoader.classList.add('active');
    dictionaryContent.innerHTML = '';
    emptyState.classList.add('hidden');

    try {
        const { data, error } = await supabase
            .from('dictionary')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        currentEntries = data as DictionaryEntry[];
        renderList(searchInput.value.trim().toLowerCase());
    } catch (error: any) {
        console.error('Error fetching dictionary:', error);
        if (error.code === '42P01') {
            showToast("Table 'dictionary' does not exist. Create it in Supabase.", 'error');
        } else {
            showToast('Failed to load dictionary: ' + error.message, 'error');
        }
    } finally {
        listLoader.classList.remove('active');
    }
}

// ── Render ──
function renderList(searchTerm: string | null = null) {
    // If searchTerm is not provided, use the current input value
    const term = searchTerm !== null ? searchTerm : searchInput.value.trim().toLowerCase();

    dictionaryContent.innerHTML = '';
    pagination.innerHTML = '';

    const filtered = currentEntries.filter(entry =>
        entry.word.toLowerCase().includes(term) ||
        entry.target_word.toLowerCase().includes(term)
    );

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        emptyText.textContent = term
            ? `No words matching "${term}"`
            : 'No words found. Add your first typo!';
        pagination.classList.add('hidden');
        updateStat(statTotal, currentEntries.length);
        updateStat(statFiltered, 0);
        return;
    }

    // Apply pagination
    const totalPages = Math.ceil(filtered.length / entriesShown);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

    const start = (currentPage - 1) * entriesShown;
    const end = start + entriesShown;
    const displayList = filtered.slice(start, end);

    // Update stats
    updateStat(statTotal, currentEntries.length);
    updateStat(statFiltered, displayList.length);

    emptyState.classList.add('hidden');

    // Render a single continuous list
    let animDelay = 0;
    const list = document.createElement('div');
    list.className = 'entry-list';

    displayList.forEach(entry => {
        const el = document.createElement('div');
        el.className = 'entry';
        el.style.animationDelay = `${animDelay}ms`;
        animDelay += 30;

        const typoText = term ? highlightMatch(escapeHTML(entry.word), term) : escapeHTML(entry.word);
        const correctText = term ? highlightMatch(escapeHTML(entry.target_word), term) : escapeHTML(entry.target_word);

        el.innerHTML = `
        <div class="entry-dot"></div>
        <span class="entry-typo">${typoText}</span>
        <span class="entry-arrow">→</span>
        <span class="entry-correct">${correctText}</span>
        <span class="entry-spacer"></span>
        <div class="entry-actions">
          <button class="entry-edit" data-id="${entry.id}" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="entry-delete" data-id="${entry.id}" data-word="${escapeHTML(entry.word)}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

        // Edit button click
        const editBtn = el.querySelector('.entry-edit') as HTMLButtonElement;
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditDrawer(entry.id, entry.word, entry.target_word);
        });

        // Delete button click
        const deleteBtn = el.querySelector('.entry-delete') as HTMLButtonElement;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal(entry.id, entry.word);
        });

        list.appendChild(el);
    });

    dictionaryContent.appendChild(list);

    // Render Pagination Controls
    if (totalPages > 1) {
        pagination.classList.remove('hidden');

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = currentPage === 1;
        prevBtn.setAttribute('aria-label', 'Previous page');
        prevBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        `;
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                renderList();
            }
        });

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.setAttribute('aria-label', 'Next page');
        nextBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < totalPages) {
                currentPage++;
                renderList();
            }
        });

        const info = document.createElement('div');
        info.className = 'pagination-info';
        info.innerHTML = `Page <span class="pagination-page">${currentPage}</span> of ${totalPages}`;

        pagination.appendChild(prevBtn);
        pagination.appendChild(info);
        pagination.appendChild(nextBtn);
    } else {
        pagination.classList.add('hidden');
    }
}

function updateStat(el: HTMLElement, value: number) {
    const numEl = el.querySelector('.stat-number')!;
    numEl.textContent = value.toString();
}

function highlightMatch(text: string, term: string): string {
    if (!term) return text;
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Add Word ──
async function handleAddWord(e: SubmitEvent) {
    e.preventDefault();

    if (!supabase) {
        showToast('Supabase not configured. Check .env file.', 'error');
        return;
    }

    const typo = typoInput.value.trim();
    const correct = correctInput.value.trim();
    if (!typo || !correct) return;

    submitBtn.disabled = true;
    submitLoader.classList.add('active');

    try {
        const { data, error } = await supabase
            .from('dictionary')
            .insert([{ word: typo, target_word: correct }])
            .select();

        if (error) throw error;

        showToast(`Added "${typo}" → "${correct}"`, 'success');
        addWordForm.reset();
        closeDrawer();

        if (data && data.length > 0) {
            currentEntries.unshift(data[0] as DictionaryEntry);
            renderList(searchInput.value.trim().toLowerCase());
        }
    } catch (error: any) {
        console.error('Error adding word:', error);
        showToast(error.message || 'Failed to add word.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitLoader.classList.remove('active');
    }
}

async function handleEditWord(e: SubmitEvent) {
    e.preventDefault();

    if (!supabase || !pendingEditId) {
        showToast('Operation not permitted.', 'error');
        return;
    }

    const typo = editTypoInput.value.trim();
    const correct = editCorrectInput.value.trim();
    if (!typo || !correct) return;

    editSubmitBtn.disabled = true;
    editSubmitLoader.classList.add('active');

    try {
        const { data, error } = await supabase
            .from('dictionary')
            .update({ word: typo, target_word: correct })
            .eq('id', pendingEditId)
            .select();

        if (error) throw error;

        showToast(`Updated to "${typo}" → "${correct}"`, 'success');
        closeEditDrawer();

        if (data && data.length > 0) {
            // Update local state
            const index = currentEntries.findIndex(e => e.id === pendingEditId);
            if (index !== -1) {
                currentEntries[index] = data[0] as DictionaryEntry;
                renderList();
            }
        }
    } catch (error: any) {
        console.error('Error updating word:', error);
        showToast(error.message || 'Failed to update word.', 'error');
    } finally {
        editSubmitBtn.disabled = false;
        editSubmitLoader.classList.remove('active');
    }
}

// ── Delete ──
function openDeleteModal(id: string, word: string) {
    pendingDeleteId = id;
    deleteWord.textContent = word;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    pendingDeleteId = null;
}

async function handleDeleteConfirm() {
    if (!supabase || !pendingDeleteId) return;

    const id = pendingDeleteId;
    closeDeleteModal();

    try {
        const { data, error } = await supabase
            .from('dictionary')
            .delete()
            .eq('id', id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error("Deletion blocked by Supabase. Please check your Row Level Security (RLS) policies.");
        }

        currentEntries = currentEntries.filter(e => e.id !== id);
        renderList(searchInput.value.trim().toLowerCase());
        showToast('Entry deleted.', 'success');
    } catch (error: any) {
        console.error('Error deleting entry:', error);
        showToast('Failed to delete: ' + error.message, 'error');
        // Refresh list to properly sync state with the database
        await fetchDictionary();
    }
}

// ── Toast ──
function showToast(message: string, type: 'success' | 'error') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success'
        ? '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

    toast.innerHTML = `${icon}<span>${escapeHTML(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('leaving');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
}

// ── Helpers ──
function escapeHTML(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── Start ──
init();

// ==================== STATE ====================
// Persisted to localStorage (there's no backend yet) so the employee
// portal's Events page can show these same announcements and the same
// per-branch calendar in read-only form.

const EVENTS_POSTS_KEY = 'vvEventsPosts';
const EVENTS_AVAILABILITY_KEY = 'vvEventsAvailability';

function loadPosts() {
    try {
        const raw = localStorage.getItem(EVENTS_POSTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePosts() {
    try {
        localStorage.setItem(EVENTS_POSTS_KEY, JSON.stringify(posts));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

function loadAvailability() {
    try {
        const raw = localStorage.getItem(EVENTS_AVAILABILITY_KEY);
        return raw ? JSON.parse(raw) : { Ibaan: {}, 'San Jose': {} };
    } catch {
        return { Ibaan: {}, 'San Jose': {} };
    }
}

function saveAvailability() {
    try {
        localStorage.setItem(EVENTS_AVAILABILITY_KEY, JSON.stringify(availability));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let posts = loadPosts();
let nextPostId = posts.reduce((max, p) => Math.max(max, p.id + 1), 1);
let composerPhotoDataUrl = null;

// Keyed by branch first, so Ibaan and San Jose each keep their own calendar:
// { 'Ibaan': { 'YYYY-MM-DD': 'available' | 'unavailable' }, 'San Jose': {...} }
const availability = loadAvailability();
let selectedEventsBranch = 'Ibaan';
let calendarViewDate = new Date();
calendarViewDate.setDate(1);

// ==================== DOM REFS ====================

const composerAvatar = document.getElementById('composerAvatar');
const postComposerInput = document.getElementById('postComposerInput');
const composerPhotoWrap = document.getElementById('composerPhotoWrap');
const composerPhotoPreview = document.getElementById('composerPhotoPreview');
const composerPhotoRemoveBtn = document.getElementById('composerPhotoRemoveBtn');
const composerPhotoInput = document.getElementById('composerPhotoInput');
const composerPostBtn = document.getElementById('composerPostBtn');
const eventsFeed = document.getElementById('eventsFeed');

const eventsBranchSelect = document.getElementById('eventsBranchSelect');
const calPrevBtn = document.getElementById('calPrevBtn');
const calNextBtn = document.getElementById('calNextBtn');
const calMonthLabel = document.getElementById('calMonthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const closuresList = document.getElementById('closuresList');
const closuresListTitle = document.getElementById('closuresListTitle');

// ==================== HELPERS ====================

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function toIsoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(isoString) {
    const [year, month, day] = isoString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(date) {
    // Round-tripping through localStorage turns the Date into an ISO string.
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ==================== COMPOSER ====================

function renderComposerAvatar() {
    composerAvatar.innerHTML = getAvatarHTML(getAdminProfile());
}

renderComposerAvatar();

function updatePostButtonState() {
    const hasText = postComposerInput.value.trim().length > 0;
    composerPostBtn.disabled = !(hasText || composerPhotoDataUrl);
}

if (postComposerInput) {
    postComposerInput.addEventListener('input', updatePostButtonState);
}

if (composerPhotoInput) {
    composerPhotoInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            composerPhotoDataUrl = e.target.result;
            composerPhotoPreview.src = composerPhotoDataUrl;
            composerPhotoWrap.hidden = false;
            updatePostButtonState();
        };
        reader.readAsDataURL(file);
    });
}

if (composerPhotoRemoveBtn) {
    composerPhotoRemoveBtn.addEventListener('click', function () {
        composerPhotoDataUrl = null;
        composerPhotoInput.value = '';
        composerPhotoWrap.hidden = true;
        composerPhotoPreview.src = '';
        updatePostButtonState();
    });
}

function resetComposer() {
    postComposerInput.value = '';
    composerPhotoDataUrl = null;
    composerPhotoInput.value = '';
    composerPhotoWrap.hidden = true;
    composerPhotoPreview.src = '';
    updatePostButtonState();
}

if (composerPostBtn) {
    composerPostBtn.addEventListener('click', function () {
        const text = postComposerInput.value.trim();
        if (!text && !composerPhotoDataUrl) return;

        const profile = getAdminProfile();
        posts.unshift({
            id: nextPostId++,
            authorName: profile.name,
            authorPhoto: profile.photo,
            text,
            photo: composerPhotoDataUrl,
            createdAt: new Date()
        });

        savePosts();
        resetComposer();
        renderFeed();
        showToast('Announcement posted.');
    });
}

// ==================== FEED ====================

function renderFeed() {
    if (posts.length === 0) {
        eventsFeed.innerHTML = '<p class="empty-state">No announcements yet. Share an update above.</p>';
        return;
    }

    eventsFeed.innerHTML = posts.map(post => `
        <div class="post-card" data-id="${post.id}">
            <div class="post-head">
                <span class="post-avatar">${getAvatarHTML({ name: post.authorName, photo: post.authorPhoto })}</span>
                <div class="post-head-text">
                    <p class="post-author">${escapeHtml(post.authorName)}</p>
                    <p class="post-timestamp">${formatTimestamp(post.createdAt)}</p>
                </div>
                <button type="button" class="post-delete-btn" data-id="${post.id}" aria-label="Delete post">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
            </div>
            ${post.text ? `<p class="post-text">${escapeHtml(post.text)}</p>` : ''}
            ${post.photo ? `<img class="post-photo" src="${post.photo}" alt="Announcement photo">` : ''}
        </div>
    `).join('');
}

if (eventsFeed) {
    eventsFeed.addEventListener('click', function (e) {
        const deleteBtn = e.target.closest('.post-delete-btn');
        if (!deleteBtn) return;

        const id = Number(deleteBtn.dataset.id);
        if (confirm('Delete this announcement?')) {
            posts = posts.filter(p => p.id !== id);
            savePosts();
            renderFeed();
            showToast('Announcement deleted.');
        }
    });
}

// ==================== AVAILABILITY CALENDAR ====================

function getBranchAvailability() {
    return availability[selectedEventsBranch];
}

if (eventsBranchSelect) {
    eventsBranchSelect.addEventListener('change', function () {
        selectedEventsBranch = this.value;
        renderCalendar();
        renderClosuresList();
    });
}

function renderCalendar() {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const branchAvailability = getBranchAvailability();

    calMonthLabel.textContent = calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayIso = toIsoDate(new Date());

    let html = '';

    for (let i = 0; i < firstWeekday; i++) {
        html += '<div class="cal-cell"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const iso = toIsoDate(new Date(year, month, day));
        const state = branchAvailability[iso];
        const classes = ['cal-day-btn'];
        if (iso === todayIso) classes.push('is-today');
        if (state === 'unavailable') classes.push('is-unavailable');
        if (state === 'available') classes.push('is-available');

        html += `<div class="cal-cell"><button type="button" class="${classes.join(' ')}" data-date="${iso}">${day}</button></div>`;
    }

    calendarGrid.innerHTML = html;
}

if (calendarGrid) {
    calendarGrid.addEventListener('click', function (e) {
        const btn = e.target.closest('.cal-day-btn');
        if (!btn) return;

        const iso = btn.dataset.date;
        const branchAvailability = getBranchAvailability();
        const current = branchAvailability[iso];

        if (!current) {
            branchAvailability[iso] = 'unavailable';
        } else if (current === 'unavailable') {
            branchAvailability[iso] = 'available';
        } else {
            delete branchAvailability[iso];
        }

        saveAvailability();
        renderCalendar();
        renderClosuresList();
    });
}

if (calPrevBtn) {
    calPrevBtn.addEventListener('click', function () {
        calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
        renderCalendar();
    });
}

if (calNextBtn) {
    calNextBtn.addEventListener('click', function () {
        calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
        renderCalendar();
    });
}

function renderClosuresList() {
    if (closuresListTitle) {
        closuresListTitle.textContent = `Upcoming changes — ${selectedEventsBranch}`;
    }

    const todayIso = toIsoDate(new Date());
    const entries = Object.entries(getBranchAvailability())
        .filter(([date]) => date >= todayIso)
        .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
        closuresList.innerHTML = '<li class="empty-state">No dates marked yet.</li>';
        return;
    }

    closuresList.innerHTML = entries.map(([date, state]) => `
        <li class="closure-item">
            <span class="closure-date">${formatDateLabel(date)}</span>
            <span class="closure-status ${state}">${state === 'unavailable' ? 'Unavailable' : 'Available'}</span>
        </li>
    `).join('');
}

// ==================== INIT ====================

renderFeed();
renderCalendar();
renderClosuresList();

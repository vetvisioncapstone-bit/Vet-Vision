// ==================== STATE ====================
// Reads the same localStorage keys the admin Events page writes to, so
// admin announcements and the availability calendar show up here too.
// This page is read-only for staff - posting/editing happens on the admin side.

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

function loadAvailability() {
    try {
        const raw = localStorage.getItem(EVENTS_AVAILABILITY_KEY);
        return raw ? JSON.parse(raw) : { Ibaan: {}, 'San Jose': {} };
    } catch {
        return { Ibaan: {}, 'San Jose': {} };
    }
}

let posts = loadPosts();
let availability = loadAvailability();
let calendarViewDate = new Date();
calendarViewDate.setDate(1);

// ==================== DOM REFS ====================

const eventsFeed = document.getElementById('eventsFeed');

const clinicStatusCard = document.getElementById('clinicStatusCard');
const clinicStatusLabel = document.getElementById('clinicStatusLabel');
const clinicStatusSub = document.getElementById('clinicStatusSub');

const calPrevBtn = document.getElementById('calPrevBtn');
const calNextBtn = document.getElementById('calNextBtn');
const calMonthLabel = document.getElementById('calMonthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const closuresList = document.getElementById('closuresList');

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
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ==================== CLINIC STATUS (today, this branch) ====================

function renderClinicStatus() {
    const todayIso = toIsoDate(new Date());
    const branchAvailability = availability[getEmployeeBranch()] || {};
    const isClosed = branchAvailability[todayIso] === 'unavailable';

    clinicStatusCard.classList.toggle('is-closed', isClosed);
    clinicStatusLabel.textContent = isClosed ? 'Clinic is Closed Today' : 'Clinic is Open Today';
    clinicStatusSub.textContent = isClosed
        ? 'Marked unavailable by the admin for today.'
        : 'No closures scheduled for today.';
}

// ==================== FEED (read-only) ====================

function renderFeed() {
    if (posts.length === 0) {
        eventsFeed.innerHTML = '<p class="empty-state">No announcements yet.</p>';
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
            </div>
            ${post.text ? `<p class="post-text">${escapeHtml(post.text)}</p>` : ''}
            ${post.photo ? `<img class="post-photo" src="${post.photo}" alt="Announcement photo">` : ''}
        </div>
    `).join('');
}

// ==================== AVAILABILITY CALENDAR (read-only) ====================

function renderCalendar() {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const branchAvailability = availability[getEmployeeBranch()] || {};

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

        html += `<div class="cal-cell"><span class="${classes.join(' ')}">${day}</span></div>`;
    }

    calendarGrid.innerHTML = html;
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
    const branchAvailability = availability[getEmployeeBranch()] || {};
    const todayIso = toIsoDate(new Date());
    const entries = Object.entries(branchAvailability)
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

// Pick up admin-side calendar/post changes made in another tab.
window.addEventListener('storage', e => {
    if (e.key === EVENTS_AVAILABILITY_KEY) {
        availability = loadAvailability();
        renderClinicStatus();
        renderCalendar();
        renderClosuresList();
    }
    if (e.key === EVENTS_POSTS_KEY) {
        posts = loadPosts();
        renderFeed();
    }
});

// ==================== INIT ====================

renderClinicStatus();
renderFeed();
renderCalendar();
renderClosuresList();

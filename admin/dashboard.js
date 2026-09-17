// ==================== TOAST ====================

const toast = document.getElementById('toast');
let toastTimer = null;

// actionLabel/actionFn are optional - pass both to add a button inside the
// toast (e.g. "Print") that runs actionFn and dismisses the toast on click.
function showToast(message, actionLabel, actionFn) {
    toast.innerHTML = '';

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    if (actionLabel && actionFn) {
        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'toast-action';
        actionBtn.textContent = actionLabel;
        actionBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            actionFn();
            toast.classList.remove('show');
        });
        toast.appendChild(actionBtn);
    }

    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), actionLabel ? 5000 : 2600);
}

// ==================== ADMIN PROFILE ====================
// Stored in localStorage (not the in-memory-only pattern used elsewhere)
// because it has to be readable from every separate page load, including
// the login page's own script.js, which keeps its own copy of this same
// read logic since it doesn't load dashboard.js.

const ADMIN_PROFILE_KEY = 'vetVisionAdminProfile';
const DEFAULT_ADMIN_PROFILE = {
    name: 'June Jericho Humarang',
    email: 'junejerichohumarang@ecovet.ph',
    password: 'Vetvision2026!',
    photo: null
};

function getAdminProfile() {
    try {
        const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
        if (!raw) return { ...DEFAULT_ADMIN_PROFILE };
        const parsed = JSON.parse(raw);
        return {
            name: parsed.name || DEFAULT_ADMIN_PROFILE.name,
            email: parsed.email || DEFAULT_ADMIN_PROFILE.email,
            password: parsed.password || DEFAULT_ADMIN_PROFILE.password,
            photo: parsed.photo || null
        };
    } catch {
        return { ...DEFAULT_ADMIN_PROFILE };
    }
}

function saveAdminProfile(profile) {
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile));
}

function getInitialsFromName(name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarHTML(profile) {
    if (profile.photo) {
        return `<img src="${profile.photo}" alt="${profile.name}" class="avatar-photo-img">`;
    }
    return getInitialsFromName(profile.name);
}

// ==================== SESSION ====================
// Set by the login page (script.js) into sessionStorage - tab-scoped, so
// an admin and an employee can be signed in at once in different tabs.
// This file is the shared chrome script for BOTH portals (employee pages
// load it as ../admin/dashboard.js), so the topbar identity below reflects
// whoever is actually signed in rather than always showing the admin.

const SESSION_KEY = 'vvCurrentSession';

function getSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function applyAdminProfileToTopbar() {
    const session = getSession();
    const isEmployeeSession = Boolean(session && session.role === 'employee');
    const profile = isEmployeeSession
        ? { name: session.name, photo: session.photo || null }
        : getAdminProfile();
    const avatarHTML = getAvatarHTML(profile);

    document.querySelectorAll('#avatarBtn').forEach(el => { el.innerHTML = avatarHTML; });
    document.querySelectorAll('.profile-avatar').forEach(el => { el.innerHTML = avatarHTML; });
    document.querySelectorAll('.profile-name').forEach(el => { el.textContent = profile.name; });

    if (isEmployeeSession) {
        document.querySelectorAll('.profile-role').forEach(el => { el.textContent = `Staff — ${session.branch}`; });
    }
}

applyAdminProfileToTopbar();

// ==================== NAVIGATION ====================

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function (e) {
        const page = this.dataset.page;

        if (this.getAttribute('href') === '#') {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            showToast(`${page} page is coming soon 🚧`);
        }

        closeSidebar();
    });
});

// ==================== MOBILE SIDEBAR ====================

const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const hamburgerBtn = document.getElementById('hamburgerBtn');

function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
}

if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
});

// ==================== TOPBAR POPOVERS ====================

const popovers = [
    { btn: document.getElementById('notifBtn'), panel: document.getElementById('notifPopover') },
    { btn: document.getElementById('avatarBtn'), panel: document.getElementById('profilePopover') }
];

function closeAllPopovers(except) {
    popovers.forEach(({ btn, panel }) => {
        if (panel === except) return;
        panel.classList.remove('show');
        btn.setAttribute('aria-expanded', 'false');
    });
}

popovers.forEach(({ btn, panel }) => {
    if (!btn || !panel) return;
    panel.addEventListener('click', e => e.stopPropagation());
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = panel.classList.contains('show');
        closeAllPopovers();
        if (!isOpen) {
            panel.classList.add('show');
            btn.setAttribute('aria-expanded', 'true');
        }
    });
});

document.addEventListener('click', () => closeAllPopovers());

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllPopovers();
});

// ==================== ABOUT MODAL ====================

const aboutBtn = document.getElementById('aboutBtn');
const aboutModalOverlay = document.getElementById('aboutModalOverlay');
const aboutModalClose = document.getElementById('aboutModalClose');

function closeAboutModal() {
    if (aboutModalOverlay) aboutModalOverlay.classList.remove('show');
}

if (aboutBtn && aboutModalOverlay) {
    aboutBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeAllPopovers();
        aboutModalOverlay.classList.add('show');
    });
}

if (aboutModalClose) {
    aboutModalClose.addEventListener('click', closeAboutModal);
}

if (aboutModalOverlay) {
    aboutModalOverlay.addEventListener('click', e => {
        if (e.target === aboutModalOverlay) closeAboutModal();
    });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAboutModal();
});

// ==================== NOTIFICATIONS (shared across every page) ====================
// Patients.js persists its data to this same localStorage key (under its own
// name, PATIENTS_STORAGE_KEY) so the follow-up bell works from any page in
// the system, not just the Patients page itself.

const NOTIF_PATIENTS_KEY = 'vvPatients';

function getStoredPatients() {
    try {
        const raw = localStorage.getItem(NOTIF_PATIENTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function notifEscapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function notifFormatDate(isoString) {
    if (!isoString) return '—';
    const [year, month, day] = isoString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getPatientLastVisitDate(patient) {
    if (!patient.consultations || patient.consultations.length === 0) return patient.createdAt;
    return patient.consultations.reduce((latest, c) => (c.date > latest ? c.date : latest), patient.consultations[0].date);
}

// Tracks which follow-ups the admin has actually opened the bell to look
// at, so a brand-new one can stand out in color until it's been noticed.
// Keyed by patient id + the follow-up note itself, so a fresh follow-up
// raised later for the same patient shows as new again.
const NOTIF_SEEN_KEY = 'vvSeenFollowUps';

function followUpSeenKey(patient) {
    return `${patient.id}|${patient.followUpNote || ''}`;
}

function getSeenFollowUpKeys() {
    try {
        const raw = localStorage.getItem(NOTIF_SEEN_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

function saveSeenFollowUpKeys(seenKeys) {
    try {
        localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify([...seenKeys]));
    } catch {
        // Not critical - worst case a seen notification shows as new again.
    }
}

function markFollowUpsSeen() {
    const followUps = getStoredPatients().filter(p => p.status === 'Follow-up needed');
    const seenKeys = getSeenFollowUpKeys();
    followUps.forEach(p => seenKeys.add(followUpSeenKey(p)));
    saveSeenFollowUpKeys(seenKeys);
}

// ==================== DELETE REQUESTS (employee -> admin approval) ====================
// Employees can add/update inventory & patient records freely, but any
// delete has to clear the admin first - this queue is how the request
// reaches the admin from any page/tab without a real backend. Approval
// writes straight to the same localStorage keys inventory.js/patients.js
// own, and also nudges their in-memory copy if that page happens to be
// the one currently open.

const DELETE_REQUESTS_KEY = 'vvDeleteRequests';
const RESTOCK_REQUESTS_KEY = 'vvRestockRequests';

function getDeleteRequests() {
    try {
        const raw = localStorage.getItem(DELETE_REQUESTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveDeleteRequests(requests) {
    try {
        localStorage.setItem(DELETE_REQUESTS_KEY, JSON.stringify(requests));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

// type: 'inventory-product' | 'patient' | 'consultation'.
// extra: for 'consultation', { patientId } identifying the owning patient.
function requestDelete(type, targetId, label, extra) {
    const session = getSession();
    const requests = getDeleteRequests();
    requests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        targetId,
        label,
        extra: extra || null,
        requestedByName: session ? session.name : 'Unknown staff',
        requestedByBranch: session ? session.branch : '',
        requestedAt: new Date().toISOString()
    });
    saveDeleteRequests(requests);
}

function refreshInventoryIfLoaded(freshProducts) {
    if (typeof products === 'undefined' || typeof renderProducts !== 'function') return;
    products = freshProducts;
    renderProducts();
    if (typeof renderCategoryFilter === 'function') renderCategoryFilter();
}

function refreshPatientsIfLoaded(freshPatients) {
    if (typeof patients === 'undefined' || typeof renderPatients !== 'function') return;
    patients = freshPatients;
    renderPatients();
    if (typeof renderStatusFilter === 'function') renderStatusFilter();
}

function executeApprovedDelete(request) {
    if (request.type === 'inventory-product') {
        const freshProducts = JSON.parse(localStorage.getItem('vvInventoryProducts') || '[]')
            .filter(p => p.id !== request.targetId);
        localStorage.setItem('vvInventoryProducts', JSON.stringify(freshProducts));
        refreshInventoryIfLoaded(freshProducts);
    } else if (request.type === 'patient') {
        const freshPatients = JSON.parse(localStorage.getItem(NOTIF_PATIENTS_KEY) || '[]')
            .filter(p => p.id !== request.targetId);
        localStorage.setItem(NOTIF_PATIENTS_KEY, JSON.stringify(freshPatients));
        refreshPatientsIfLoaded(freshPatients);
    } else if (request.type === 'consultation' && request.extra) {
        const freshPatients = JSON.parse(localStorage.getItem(NOTIF_PATIENTS_KEY) || '[]');
        const owner = freshPatients.find(p => p.id === request.extra.patientId);
        if (owner) owner.consultations = owner.consultations.filter(c => c.id !== request.targetId);
        localStorage.setItem(NOTIF_PATIENTS_KEY, JSON.stringify(freshPatients));
        refreshPatientsIfLoaded(freshPatients);
    }
}

function approveDeleteRequest(requestId) {
    const requests = getDeleteRequests();
    const request = requests.find(r => r.id === requestId);
    if (!request) return;
    executeApprovedDelete(request);
    saveDeleteRequests(requests.filter(r => r.id !== requestId));
    renderNotifications();
    showToast(`Deleted "${request.label}".`);
}

function denyDeleteRequest(requestId) {
    const requests = getDeleteRequests();
    const request = requests.find(r => r.id === requestId);
    saveDeleteRequests(requests.filter(r => r.id !== requestId));
    renderNotifications();
    if (request) showToast(`Denied the request to delete "${request.label}".`);
}

// ==================== RESTOCK REQUESTS (employee -> admin heads-up) ====================
// Lower-stakes than a delete request - no approval needed, just visibility.

function getRestockRequests() {
    try {
        const raw = localStorage.getItem(RESTOCK_REQUESTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveRestockRequests(requests) {
    try {
        localStorage.setItem(RESTOCK_REQUESTS_KEY, JSON.stringify(requests));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

function requestRestock(productId, productName, branch) {
    const session = getSession();
    const requests = getRestockRequests();
    requests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId,
        productName,
        branch: branch || (session ? session.branch : ''),
        requestedByName: session ? session.name : 'Unknown staff',
        requestedAt: new Date().toISOString()
    });
    saveRestockRequests(requests);
}

function dismissRestockRequest(requestId) {
    saveRestockRequests(getRestockRequests().filter(r => r.id !== requestId));
    renderNotifications();
}

const notifBtn = document.getElementById('notifBtn');
const notifPopover = document.getElementById('notifPopover');
const notifDot = document.getElementById('notifDot');
const notifList = document.getElementById('notifList');

// Delete/restock requests need the admin's attention specifically - an
// employee's own bell only ever shows follow-ups, never these.
function isAdminContext() {
    const session = getSession();
    return !session || session.role === 'admin';
}

function renderNotifications() {
    if (!notifList) return;

    const followUps = getStoredPatients().filter(p => p.status === 'Follow-up needed');
    const seenKeys = getSeenFollowUpKeys();
    const adminContext = isAdminContext();
    const deleteRequests = adminContext ? getDeleteRequests() : [];
    const restockRequests = adminContext ? getRestockRequests() : [];

    const totalCount = followUps.length + deleteRequests.length + restockRequests.length;
    if (notifDot) notifDot.hidden = totalCount === 0;

    if (totalCount === 0) {
        notifList.innerHTML = '<p class="empty-state">No notifications yet.</p>';
        return;
    }

    const deleteHtml = deleteRequests.map(r => `
        <div class="notif-item notif-item-request">
            <p class="notif-item-title">Delete request: ${notifEscapeHtml(r.label)}</p>
            <p class="notif-item-sub">${notifEscapeHtml(r.requestedByName)}${r.requestedByBranch ? ` · ${notifEscapeHtml(r.requestedByBranch)}` : ''}</p>
            <div class="notif-item-actions">
                <button type="button" class="notif-action-btn approve" data-approve-delete="${r.id}">Approve</button>
                <button type="button" class="notif-action-btn deny" data-deny-delete="${r.id}">Deny</button>
            </div>
        </div>
    `).join('');

    const restockHtml = restockRequests.map(r => `
        <div class="notif-item notif-item-request">
            <p class="notif-item-title">Restock requested: ${notifEscapeHtml(r.productName)}</p>
            <p class="notif-item-sub">${notifEscapeHtml(r.requestedByName)}${r.branch ? ` · ${notifEscapeHtml(r.branch)}` : ''}</p>
            <div class="notif-item-actions">
                <button type="button" class="notif-action-btn" data-dismiss-restock="${r.id}">Dismiss</button>
            </div>
        </div>
    `).join('');

    const followUpHtml = followUps.map(p => `
        <div class="notif-item${seenKeys.has(followUpSeenKey(p)) ? ' is-seen' : ''}">
            <button type="button" class="notif-item-body" data-followup-id="${p.id}">
                <p class="notif-item-title">${notifEscapeHtml(p.petName)} needs a follow-up${p.followUpNote ? `: ${notifEscapeHtml(p.followUpNote)}` : ''}</p>
                <p class="notif-item-sub">${notifEscapeHtml(p.ownerName)} ${notifEscapeHtml(p.ownerSurname)} · Last visit ${notifFormatDate(getPatientLastVisitDate(p))}</p>
            </button>
        </div>
    `).join('');

    notifList.innerHTML = deleteHtml + restockHtml + followUpHtml;

    notifList.querySelectorAll('[data-followup-id]').forEach(btn => {
        btn.addEventListener('click', function () {
            const id = Number(this.dataset.followupId);
            closeAllPopovers();

            // On a page that already has a patient detail modal (admin's
            // patients.js or the employee equivalent), jump straight there.
            // Anywhere else, navigate to the right portal's Patients page,
            // which reads ?followUp=<id> on load and opens it automatically.
            if (typeof openPatientDetailModal === 'function' && typeof patients !== 'undefined') {
                const patient = patients.find(p => p.id === id);
                if (patient) openPatientDetailModal(patient);
            } else {
                const session = getSession();
                const destination = (session && session.role === 'employee')
                    ? `employee-patients.html?followUp=${id}`
                    : `patients.html?followUp=${id}`;
                window.location.href = destination;
            }
        });
    });

    notifList.querySelectorAll('[data-approve-delete]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            approveDeleteRequest(btn.dataset.approveDelete);
        });
    });

    notifList.querySelectorAll('[data-deny-delete]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            denyDeleteRequest(btn.dataset.denyDelete);
        });
    });

    notifList.querySelectorAll('[data-dismiss-restock]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            dismissRestockRequest(btn.dataset.dismissRestock);
        });
    });
}

renderNotifications();

// Opening the bell is what counts as "noticing" - mark everything currently
// listed as seen and re-render so their color mutes immediately.
if (notifBtn && notifPopover) {
    notifBtn.addEventListener('click', function () {
        if (notifPopover.classList.contains('show')) {
            markFollowUpsSeen();
            renderNotifications();
        }
    });
}

// Other tabs/pages saving patient/product/request data (or this page's own
// scripts, which call renderNotifications() themselves after each change)
// both need to refresh this bell - 'storage' covers the cross-tab case.
window.addEventListener('storage', e => {
    if ([NOTIF_PATIENTS_KEY, DELETE_REQUESTS_KEY, RESTOCK_REQUESTS_KEY].includes(e.key)) renderNotifications();
});

// ==================== BRANCH FILTER (not wired up yet) ====================

const branchSelect = document.getElementById('branchSelect');

if (branchSelect) {
    branchSelect.addEventListener('change', function () {
        if (this.dataset.filterWired) return;
        showToast('Branch filtering isn\'t connected to any data yet.');
    });
}

// ==================== SALES ANALYTICS FILTERS (not wired up yet) ====================

const yearSelect = document.getElementById('yearSelect');
const chartPeriodSelect = document.getElementById('chartPeriodSelect');

if (yearSelect) {
    yearSelect.addEventListener('change', function () {
        showToast(`Year filter isn't connected to any data yet.`);
    });
}

if (chartPeriodSelect) {
    chartPeriodSelect.addEventListener('change', function () {
        showToast(`Chart period isn't connected to any data yet.`);
    });
}

// ==================== CHAT PANEL ====================

const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatPanelClose = document.getElementById('chatPanelClose');
const chatPanelBody = document.getElementById('chatPanelBody');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

function openChatPanel() {
    if (!chatPanel) return;
    chatPanel.classList.add('show');
    if (chatInput) chatInput.focus();
}

function closeChatPanel() {
    if (!chatPanel) return;
    chatPanel.classList.remove('show');
}

if (chatFab) {
    chatFab.addEventListener('click', e => {
        e.stopPropagation();
        chatPanel.classList.contains('show') ? closeChatPanel() : openChatPanel();
    });
}

if (chatPanelClose) {
    chatPanelClose.addEventListener('click', closeChatPanel);
}

if (chatPanel) {
    chatPanel.addEventListener('click', e => e.stopPropagation());
}

document.addEventListener('click', closeChatPanel);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeChatPanel();
});

function addChatBubble(text, from) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${from}`;
    bubble.textContent = text;
    chatPanelBody.appendChild(bubble);
    chatPanelBody.scrollTop = chatPanelBody.scrollHeight;
}

if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;

        addChatBubble(message, 'user');
        chatInput.value = '';

        setTimeout(() => {
            addChatBubble("Thanks for your message! I'm not connected to a live assistant yet - you're just seeing the chat layout for now.", 'bot');
        }, 500);
    });
}

// ==================== ENTRANCE ANIMATION STAGGER ====================

function staggerIn(selector) {
    document.querySelectorAll(selector).forEach((el, i) => {
        el.style.animationDelay = `${0.05 + i * 0.07}s`;
    });
}

staggerIn('.nav-item');

console.log('%c🐾 Vet Vision Dashboard', 'font-size: 16px; color: #2d7a4d; font-weight: bold;');
console.log('%cNo database connected yet - all stats and charts are placeholders.', 'font-size: 12px; color: #666;');

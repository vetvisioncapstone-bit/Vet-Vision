// ==================== STATE ====================
// Persisted to localStorage (there's no backend yet) so every other page's
// notification bell can read it too - see renderNotifications() in
// dashboard.js, which renders the shared follow-up notifications dropdown
// (reading this same key under its own name, NOTIF_PATIENTS_KEY).
// ownerEmail is treated as the record's key: it's what the customer website
// will use to look up an owner's profile and pets after they log in.

const PATIENTS_STORAGE_KEY = 'vvPatients';

function loadPatients() {
    try {
        const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePatients() {
    try {
        localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let patients = loadPatients();
let nextPatientId = patients.reduce((max, p) => Math.max(max, p.id + 1), 1);
let nextConsultationId = patients.reduce(
    (max, p) => p.consultations.reduce((m, c) => Math.max(m, c.id + 1), max),
    1
);
let editingPatientId = null;
let currentDetailPatientId = null;
let searchTerm = '';
let selectedBranch = 'All Branches';
let activeStatuses = new Set();
let selectedPatientIds = new Set();
let pendingAvailedItems = [];

// The clinic's service catalog. Products, on the other hand, come from the
// Inventory page's own records (see getInventoryProducts below) so the two
// stay a single source of truth instead of drifting apart.
const CLINIC_SERVICES = [
    'Consultation / Check-up',
    'Vaccination',
    'Deworming',
    'Grooming',
    'Dental Cleaning',
    'Spay/Neuter Surgery',
    'X-Ray',
    'Laboratory Test',
    'Ultrasound',
    'Boarding',
    'Wound Care / Minor Surgery',
    'Microchipping'
];

// Inventory (inventory.js) persists its product list to this same
// localStorage key, so it acts as the shared "database" both pages read
// from despite being separate static pages with no backend.
const INVENTORY_STORAGE_KEY = 'vvInventoryProducts';

function getInventoryProducts() {
    try {
        const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// ==================== DOM REFS ====================

const patientTableBody = document.getElementById('patientTableBody');
const statTotalPatients = document.getElementById('statTotalPatients');
const statActiveThisMonth = document.getElementById('statActiveThisMonth');
const statFollowUpNeeded = document.getElementById('statFollowUpNeeded');
const statFollowUpNeededCard = document.getElementById('statFollowUpNeededCard');
const patientSearch = document.getElementById('patientSearch');
const branchFilterSelect = document.getElementById('branchSelect');
const tableFooterCount = document.querySelector('.table-footer-count');

const patientModalTitle = document.getElementById('patientModalTitle');
const patientSaveBtn = document.getElementById('patientSaveBtn');

const ownerNameField = document.getElementById('ownerName');
const ownerSurnameField = document.getElementById('ownerSurname');
const ownerEmailField = document.getElementById('ownerEmail');
const ownerAddressField = document.getElementById('ownerAddress');
const ownerMobileField = document.getElementById('ownerMobile');
const petNameField = document.getElementById('petName');
const petSpecieField = document.getElementById('petSpecie');
const petBreedField = document.getElementById('petBreed');
const petSexField = document.getElementById('petSex');
const petDobField = document.getElementById('petDob');
const petAgeField = document.getElementById('petAge');
const petMarkingField = document.getElementById('petMarking');
const patientBranchField = document.getElementById('patientBranch');

const filterStatusList = document.getElementById('filterStatusList');

// ==================== HELPERS ====================

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(isoString) {
    if (!isoString) return '—';
    const [year, month, day] = isoString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatPrice(amount) {
    return `₱${Number(amount || 0).toFixed(2)}`;
}

// Visit count / last visit are derived from consultation history rather
// than stored separately, so they can never drift out of sync with it.

function getVisitCount(patient) {
    return 1 + patient.consultations.length;
}

function getLastVisitDate(patient) {
    if (patient.consultations.length === 0) return patient.createdAt;
    return patient.consultations.reduce((latest, c) => (c.date > latest ? c.date : latest), patient.consultations[0].date);
}

function isImageDataUrl(url) {
    return typeof url === 'string' && url.startsWith('data:image/');
}

function getStatusClass(status) {
    switch (status) {
        case 'Active': return 'status-ok';
        case 'Follow-up needed': return 'status-follow-up';
        default: return 'status-inactive';
    }
}

// ==================== RENDER ====================

function getVisiblePatients() {
    return patients.filter(p => {
        const ownerFullName = `${p.ownerName} ${p.ownerSurname}`.toLowerCase();
        const matchesSearch = !searchTerm
            || p.petName.toLowerCase().includes(searchTerm)
            || ownerFullName.includes(searchTerm)
            || p.ownerEmail.toLowerCase().includes(searchTerm);
        const matchesBranch = selectedBranch === 'All Branches' || p.branch === selectedBranch;
        const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(p.status);
        return matchesSearch && matchesBranch && matchesStatus;
    });
}

function renderPatients() {
    const visible = getVisiblePatients();

    if (patients.length === 0) {
        patientTableBody.innerHTML = '<tr><td colspan="10" class="empty-state">No patients yet. Click "+ New" to add one.</td></tr>';
    } else if (visible.length === 0) {
        patientTableBody.innerHTML = '<tr><td colspan="10" class="empty-state">No patients match your search or filter.</td></tr>';
    } else {
        patientTableBody.innerHTML = visible.map(p => `
            <tr class="patient-row" data-id="${p.id}">
                <td class="checkbox-col"><input type="checkbox" class="patient-row-checkbox" data-id="${p.id}" aria-label="Select ${p.petName}" ${selectedPatientIds.has(p.id) ? 'checked' : ''}></td>
                <td>${p.petName}</td>
                <td>${p.ownerName} ${p.ownerSurname}</td>
                <td>${p.ownerEmail}</td>
                <td>${p.petSpecie}</td>
                <td>${p.branch}</td>
                <td>${formatDate(getLastVisitDate(p))}</td>
                <td>${getVisitCount(p)}</td>
                <td><span class="status-pill ${getStatusClass(p.status)}">${p.status}</span></td>
                <td class="action-col">
                    <div class="row-actions">
                        <button type="button" class="row-action-btn edit" data-id="${p.id}" aria-label="Edit patient">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button type="button" class="row-action-btn delete" data-id="${p.id}" aria-label="Delete patient">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    if (tableFooterCount) {
        tableFooterCount.textContent = `Showing ${visible.length} of ${patients.length} entries`;
    }

    renderStats();
    syncSelectAllState();
    renderNotifications();
}

function renderStats() {
    const now = new Date();
    const activeThisMonth = patients.filter(p => {
        const lastVisit = getLastVisitDate(p);
        if (!lastVisit) return false;
        const [y, m] = lastVisit.split('-').map(Number);
        return p.status === 'Active' && y === now.getFullYear() && m === now.getMonth() + 1;
    }).length;
    const followUpNeeded = patients.filter(p => p.status === 'Follow-up needed').length;

    statTotalPatients.textContent = patients.length;
    statTotalPatients.classList.toggle('muted', patients.length === 0);
    statActiveThisMonth.textContent = activeThisMonth;
    statActiveThisMonth.classList.toggle('muted', patients.length === 0);
    statFollowUpNeeded.textContent = followUpNeeded;
    statFollowUpNeeded.classList.toggle('muted', patients.length === 0);
    if (statFollowUpNeededCard) {
        statFollowUpNeededCard.classList.toggle('follow-up-active', followUpNeeded > 0);
    }
}

function renderStatusFilter() {
    const statuses = [...new Set(patients.map(p => p.status))].sort();

    if (statuses.length === 0) {
        filterStatusList.innerHTML = '<p class="empty-state">No statuses yet.</p>';
        return;
    }

    filterStatusList.innerHTML = statuses.map(status => `
        <label class="filter-option">
            <input type="checkbox" value="${status}" ${activeStatuses.has(status) ? 'checked' : ''}>
            <span>${status}</span>
        </label>
    `).join('');

    filterStatusList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked) {
                activeStatuses.add(this.value);
            } else {
                activeStatuses.delete(this.value);
            }
            renderPatients();
        });
    });
}

// Notifications themselves are rendered globally by dashboard.js (so the
// bell works on every page, not just this one) - renderPatients() below
// still calls the shared renderNotifications() after every change here so
// this page's own bell updates instantly instead of waiting for a reload.

// ==================== NEW / EDIT PATIENT MODAL ====================

const newPatientBtn = document.getElementById('newPatientBtn');
const patientModalOverlay = document.getElementById('patientModalOverlay');
const patientModalClose = document.getElementById('patientModalClose');
const patientCancelBtn = document.getElementById('patientCancelBtn');
const patientForm = document.getElementById('patientForm');

function openAddModal() {
    editingPatientId = null;
    patientForm.reset();
    patientModalTitle.textContent = 'New patient';
    patientSaveBtn.textContent = 'Save';
    patientModalOverlay.classList.add('show');
}

function openEditModal(patient) {
    editingPatientId = patient.id;
    ownerNameField.value = patient.ownerName;
    ownerSurnameField.value = patient.ownerSurname;
    ownerEmailField.value = patient.ownerEmail;
    ownerAddressField.value = patient.ownerAddress;
    ownerMobileField.value = patient.ownerMobile;
    petNameField.value = patient.petName;
    petSpecieField.value = patient.petSpecie;
    petBreedField.value = patient.petBreed;
    petSexField.value = patient.petSex;
    petDobField.value = patient.petDob;
    petAgeField.value = patient.petAge;
    petMarkingField.value = patient.petMarking;
    patientBranchField.value = patient.branch;

    patientModalTitle.textContent = 'Edit patient';
    patientSaveBtn.textContent = 'Save changes';
    patientModalOverlay.classList.add('show');
}

function closePatientModal() {
    patientModalOverlay.classList.remove('show');
    patientForm.reset();
    editingPatientId = null;
}

if (newPatientBtn) {
    newPatientBtn.addEventListener('click', openAddModal);
}

if (patientModalClose) {
    patientModalClose.addEventListener('click', closePatientModal);
}

if (patientCancelBtn) {
    patientCancelBtn.addEventListener('click', closePatientModal);
}

if (patientModalOverlay) {
    patientModalOverlay.addEventListener('click', e => {
        if (e.target === patientModalOverlay) closePatientModal();
    });
}

if (patientForm) {
    patientForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const ownerEmail = ownerEmailField.value.trim().toLowerCase();
        const duplicate = patients.find(p => p.ownerEmail === ownerEmail && p.id !== editingPatientId);
        if (duplicate) {
            showToast('That owner email is already registered to another owner.');
            return;
        }

        const patientData = {
            ownerName: ownerNameField.value.trim(),
            ownerSurname: ownerSurnameField.value.trim(),
            ownerEmail,
            ownerAddress: ownerAddressField.value.trim(),
            ownerMobile: ownerMobileField.value.trim(),
            petName: petNameField.value.trim(),
            petSpecie: petSpecieField.value,
            petBreed: petBreedField.value.trim(),
            petSex: petSexField.value,
            petDob: petDobField.value,
            petAge: Number(petAgeField.value),
            petMarking: petMarkingField.value.trim(),
            branch: patientBranchField.value
        };

        let newPatient = null;

        if (editingPatientId) {
            const existing = patients.find(p => p.id === editingPatientId);
            Object.assign(existing, patientData);
            showToast(`"${patientData.petName}" was updated.`);
        } else {
            newPatient = {
                id: nextPatientId++,
                ...patientData,
                status: 'Active',
                createdAt: todayIso(),
                consultations: []
            };
            patients.push(newPatient);
            showToast(`"${patientData.petName}" was added.`);
        }

        savePatients();
        closePatientModal();
        renderPatients();
        renderStatusFilter();

        // Straight from filling out a new patient's info to logging their
        // first consultation, instead of dropping back to the bare table.
        if (newPatient) {
            openPatientDetailModal(newPatient);
        }
    });
}

// ==================== SELECTION (SELECT ALL) ====================

const selectAllCheckbox = document.getElementById('selectAllPatients');

function syncSelectAllState() {
    if (!selectAllCheckbox) return;
    const visibleIds = getVisiblePatients().map(p => p.id);
    const selectedVisibleCount = visibleIds.filter(id => selectedPatientIds.has(id)).length;

    if (visibleIds.length === 0 || selectedVisibleCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedVisibleCount === visibleIds.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', function () {
        const visible = getVisiblePatients();
        if (this.checked) {
            visible.forEach(p => selectedPatientIds.add(p.id));
        } else {
            visible.forEach(p => selectedPatientIds.delete(p.id));
        }
        renderPatients();
    });
}

// ==================== TABLE ROW INTERACTIONS ====================

if (patientTableBody) {
    patientTableBody.addEventListener('change', function (e) {
        const checkbox = e.target.closest('.patient-row-checkbox');
        if (!checkbox) return;

        const id = Number(checkbox.dataset.id);
        if (checkbox.checked) {
            selectedPatientIds.add(id);
        } else {
            selectedPatientIds.delete(id);
        }
        syncSelectAllState();
    });

    patientTableBody.addEventListener('click', function (e) {
        const editBtn = e.target.closest('.row-action-btn.edit');
        const deleteBtn = e.target.closest('.row-action-btn.delete');
        const checkbox = e.target.closest('input[type="checkbox"]');
        const row = e.target.closest('.patient-row');

        if (editBtn) {
            const patient = patients.find(p => p.id === Number(editBtn.dataset.id));
            if (patient) openEditModal(patient);
            return;
        }

        if (deleteBtn) {
            const patient = patients.find(p => p.id === Number(deleteBtn.dataset.id));
            if (patient && confirm(`Delete "${patient.petName}"'s record?`)) {
                patients = patients.filter(p => p.id !== patient.id);
                selectedPatientIds.delete(patient.id);
                savePatients();
                renderPatients();
                renderStatusFilter();
                showToast(`"${patient.petName}" was deleted.`);
            }
            return;
        }

        if (checkbox) return;

        if (row) {
            const patient = patients.find(p => p.id === Number(row.dataset.id));
            if (patient) openPatientDetailModal(patient);
        }
    });
}

// ==================== PATIENT DETAIL MODAL ====================

const patientDetailModalOverlay = document.getElementById('patientDetailModalOverlay');
const patientDetailModalClose = document.getElementById('patientDetailModalClose');
const detailPetName = document.getElementById('detailPetName');
const detailOwnerSub = document.getElementById('detailOwnerSub');
const detailOwnerName = document.getElementById('detailOwnerName');
const detailOwnerEmail = document.getElementById('detailOwnerEmail');
const detailOwnerMobile = document.getElementById('detailOwnerMobile');
const detailOwnerAddress = document.getElementById('detailOwnerAddress');
const detailPetSpecieBreed = document.getElementById('detailPetSpecieBreed');
const detailPetSexAge = document.getElementById('detailPetSexAge');
const detailPetMarking = document.getElementById('detailPetMarking');
const detailPetBranch = document.getElementById('detailPetBranch');
const detailStatusPill = document.getElementById('detailStatusPill');
const detailFollowUpNote = document.getElementById('detailFollowUpNote');
const detailVisitCount = document.getElementById('detailVisitCount');
const detailLastVisit = document.getElementById('detailLastVisit');
const detailEditBtn = document.getElementById('detailEditBtn');

const consultationForm = document.getElementById('consultationForm');
const consultDateField = document.getElementById('consultDate');
const consultWeightField = document.getElementById('consultWeight');
const consultNotesField = document.getElementById('consultNotes');
const availedTypeField = document.getElementById('availedType');
const availedItemField = document.getElementById('availedItem');
const availedPriceField = document.getElementById('availedPrice');
const availedAddBtn = document.getElementById('availedAddBtn');
const availedChipList = document.getElementById('availedChipList');
const bloodTestInput = document.getElementById('bloodTestInput');
const bloodTestPreviewWrap = document.getElementById('bloodTestPreviewWrap');
const bloodTestPreviewName = document.getElementById('bloodTestPreviewName');
const bloodTestRemoveBtn = document.getElementById('bloodTestRemoveBtn');
let currentBloodTestDataUrl = null;
let currentBloodTestName = '';
const waiverInput = document.getElementById('waiverInput');
const waiverPreviewWrap = document.getElementById('waiverPreviewWrap');
const waiverPreviewName = document.getElementById('waiverPreviewName');
const waiverRemoveBtn = document.getElementById('waiverRemoveBtn');
let currentWaiverDataUrl = null;
let currentWaiverName = '';
const consultRemarksField = document.getElementById('consultRemarks');
const consultFollowUpField = document.getElementById('consultFollowUp');
const followUpNoteGroup = document.getElementById('followUpNoteGroup');
const consultFollowUpNoteField = document.getElementById('consultFollowUpNote');
const cancelConsultBtn = document.getElementById('cancelConsultBtn');
const consultationHistory = document.getElementById('consultationHistory');

const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const patientHistoryModalOverlay = document.getElementById('patientHistoryModalOverlay');
const patientHistoryModalClose = document.getElementById('patientHistoryModalClose');
const historyPetNameSub = document.getElementById('historyPetNameSub');
const printAllHistoryBtn = document.getElementById('printAllHistoryBtn');

function getCurrentDetailPatient() {
    return patients.find(p => p.id === currentDetailPatientId) || null;
}

function renderPatientDetailInfo(patient) {
    detailPetName.textContent = patient.petName;
    detailOwnerSub.textContent = `${patient.ownerName} ${patient.ownerSurname}`;

    detailOwnerName.textContent = `${patient.ownerName} ${patient.ownerSurname}`;
    detailOwnerEmail.textContent = patient.ownerEmail;
    detailOwnerMobile.textContent = patient.ownerMobile;
    detailOwnerAddress.textContent = patient.ownerAddress;

    detailPetSpecieBreed.textContent = `${patient.petSpecie} — ${patient.petBreed}`;
    detailPetSexAge.textContent = `${patient.petSex}, ${patient.petAge} yr(s) old`;
    detailPetMarking.textContent = patient.petMarking;
    detailPetBranch.textContent = patient.branch;

    detailStatusPill.textContent = patient.status;
    detailStatusPill.className = `status-pill ${getStatusClass(patient.status)}`;

    if (patient.status === 'Follow-up needed' && patient.followUpNote) {
        detailFollowUpNote.textContent = `Follow-up for: ${patient.followUpNote}`;
        detailFollowUpNote.hidden = false;
    } else {
        detailFollowUpNote.hidden = true;
    }

    detailVisitCount.textContent = `${getVisitCount(patient)} visit(s)`;
    detailLastVisit.textContent = `Last visit: ${formatDate(getLastVisitDate(patient))}`;
}

function renderConsultationHistory(patient) {
    if (patient.consultations.length === 0) {
        consultationHistory.innerHTML = '<p class="empty-state">No consultations logged yet.</p>';
        return;
    }

    const sorted = [...patient.consultations].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    consultationHistory.innerHTML = sorted.map(c => `
        <div class="consultation-item" data-id="${c.id}">
            <div class="consultation-item-head">
                <span>
                    <span class="consultation-date">${formatDate(c.date)}</span>
                    ${c.weight ? `<span class="consultation-weight">${escapeHtml(c.weight)}</span>` : ''}
                </span>
                <div class="consultation-item-actions">
                    <button type="button" class="consultation-print-btn" data-id="${c.id}" aria-label="Print this consultation">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    </button>
                    <button type="button" class="consultation-delete-btn" data-id="${c.id}" aria-label="Delete consultation">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </div>
            <p class="consultation-field">${escapeHtml(c.notes)}</p>
            ${c.services ? `<p class="consultation-field"><span class="consultation-field-label">Availed:</span> ${escapeHtml(c.services)}</p>` : ''}
            ${c.totalPrice ? `<p class="consultation-total">Total: ${formatPrice(c.totalPrice)}</p>` : ''}
            ${c.remarks ? `<p class="consultation-remarks">${escapeHtml(c.remarks)}</p>` : ''}
            ${c.bloodTestImage ? `
                <div class="consultation-attachment">
                    <img src="${c.bloodTestImage}" alt="Blood test result">
                    <a href="${c.bloodTestImage}" download="${escapeHtml(c.bloodTestName || 'blood-test-result')}">View full blood test result</a>
                </div>
            ` : ''}
            ${c.waiverImage ? `
                <div class="consultation-attachment">
                    ${isImageDataUrl(c.waiverImage) ? `<img src="${c.waiverImage}" alt="Signed waiver">` : ''}
                    <a href="${c.waiverImage}" download="${escapeHtml(c.waiverName || 'signed-waiver')}">View signed waiver</a>
                </div>
            ` : ''}
            ${c.followUp ? `<span class="follow-up-pill">Follow-up needed${c.followUpNote ? `: ${escapeHtml(c.followUpNote)}` : ''}</span>` : ''}
        </div>
    `).join('');
}

// Older consultations (saved before per-item pricing was added) only have
// the flattened "services" string - fall back to splitting that instead of
// the structured availedItems array so old receipts still print correctly.
function buildConsultationCells(consultation) {
    const hasPricedItems = Boolean(consultation.availedItems && consultation.availedItems.length);
    const rxLines = hasPricedItems
        ? consultation.availedItems.map(item => `* ${escapeHtml(item.name)} — ${formatPrice(item.price)}`)
        : (consultation.services || '').split(',').map(s => s.trim()).filter(Boolean).map(text => `* ${escapeHtml(text)}`);

    const total = hasPricedItems
        ? consultation.totalPrice || consultation.availedItems.reduce((sum, i) => sum + Number(i.price || 0), 0)
        : 0;

    const treatmentHtml = [
        consultation.weight ? escapeHtml(`Wt: ${consultation.weight}`) : '',
        consultation.notes ? escapeHtml(consultation.notes) : '',
        rxLines.length ? '<strong>Rx</strong>' : '',
        ...rxLines,
        total ? `<strong>Total: ${formatPrice(total)}</strong>` : ''
    ].filter(Boolean).join('<br>') || '&nbsp;';

    const remarksHtml = [
        consultation.remarks || '',
        consultation.followUp ? `Follow-up needed: ${consultation.followUpNote || '—'}` : '',
        consultation.bloodTestImage ? 'Blood test result attached' : '',
        consultation.waiverImage ? 'Signed waiver attached' : ''
    ].filter(Boolean).map(escapeHtml).join('<br>') || '&nbsp;';

    return { treatmentHtml, remarksHtml, total };
}

function consultationAttachmentsHtml(consultation) {
    return [
        consultation.bloodTestImage ? `
            <p class="attachment-label">Blood test result — ${formatDate(consultation.date)}</p>
            <img class="attachment-img" src="${consultation.bloodTestImage}" alt="Blood test result">
        ` : '',
        consultation.waiverImage ? `
            <p class="attachment-label">Signed waiver — ${formatDate(consultation.date)}</p>
            ${isImageDataUrl(consultation.waiverImage)
                ? `<img class="attachment-img" src="${consultation.waiverImage}" alt="Signed waiver">`
                : `<p style="font-size:12px;color:#666;">(waiver on file - not an image, open from the app to view)</p>`}
        ` : ''
    ].filter(Boolean).join('');
}

const CLINIC_PRINT_STYLES = `
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 28px 34px; max-width: 720px; margin: 0 auto; }
    .letterhead { display: flex; align-items: center; justify-content: center; gap: 14px; border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 4px; }
    .letterhead img { width: 52px; height: 52px; object-fit: contain; }
    .letterhead h1 { font-size: 26px; letter-spacing: 0.02em; margin: 0; }
    .branch-address { font-size: 12px; text-align: center; margin: 4px 0 18px; }
    .info-block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .info-row { display: flex; gap: 22px; flex-wrap: wrap; }
    .info-field { display: flex; align-items: baseline; gap: 6px; flex: 1; min-width: 140px; }
    .info-field .field-label { font-weight: 700; font-size: 12.5px; white-space: nowrap; }
    .info-field .field-value { flex: 1; border-bottom: 1px solid #111; font-size: 12.5px; padding-bottom: 1px; min-height: 14px; }
    table.log { width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
    table.log th { border: 1px solid #111; padding: 6px 8px; font-size: 12.5px; background: #f2f2f2; }
    table.log td { border: 1px solid #111; padding: 8px; font-size: 12px; vertical-align: top; }
    table.log td:first-child { width: 90px; white-space: nowrap; }
    table.log td:last-child { width: 150px; }
    table.log tfoot td { font-weight: 700; background: #f7f7f7; }
    .attachment-label { font-weight: 700; font-size: 12px; margin: 14px 0 4px; }
    .attachment-img { max-width: 100%; max-height: 320px; border: 1px solid #ccc; border-radius: 6px; }
    .footer { margin-top: 20px; font-size: 10.5px; color: #888; text-align: center; }
`;

function clinicLetterheadHtml(patient) {
    const logoUrl = new URL('Images/EcovetLogo%201.png', document.baseURI).href;
    const branchAddress = patient.branch === 'Ibaan'
        ? '454 Balagtas St., Poblacion, Ibaan, Batangas'
        : `${escapeHtml(patient.branch)} Branch`;

    return `
        <div class="letterhead">
            <img src="${logoUrl}" alt="Ecovet logo">
            <h1>ECOVET ANIMAL CLINIC</h1>
        </div>
        <p class="branch-address">${branchAddress}</p>

        <div class="info-block">
            <div class="info-row">
                <div class="info-field"><span class="field-label">Client's Name:</span><span class="field-value">${escapeHtml(patient.ownerName)} ${escapeHtml(patient.ownerSurname)}</span></div>
                <div class="info-field"><span class="field-label">Pet's Name:</span><span class="field-value">${escapeHtml(patient.petName)}</span></div>
                <div class="info-field"><span class="field-label">Mobile #:</span><span class="field-value">${escapeHtml(patient.ownerMobile)}</span></div>
            </div>
            <div class="info-row">
                <div class="info-field" style="flex: 2;"><span class="field-label">Address:</span><span class="field-value">${escapeHtml(patient.ownerAddress)}</span></div>
                <div class="info-field"><span class="field-label">Specie:</span><span class="field-value">${escapeHtml(patient.petSpecie)}</span></div>
                <div class="info-field"><span class="field-label">Breed:</span><span class="field-value">${escapeHtml(patient.petBreed)}</span></div>
            </div>
            <div class="info-row">
                <div class="info-field"><span class="field-label">Pet's Date of birth:</span><span class="field-value">${formatDate(patient.petDob)}</span></div>
                <div class="info-field"><span class="field-label">Age:</span><span class="field-value">${escapeHtml(String(patient.petAge))}</span></div>
                <div class="info-field"><span class="field-label">Sex:</span><span class="field-value">${escapeHtml(patient.petSex)}</span></div>
                <div class="info-field"><span class="field-label">Color Marking:</span><span class="field-value">${escapeHtml(patient.petMarking)}</span></div>
            </div>
        </div>
    `;
}

function openClinicPrintWindow() {
    const printWindow = window.open('', '_blank', 'width=760,height=900');
    if (!printWindow) {
        showToast('Please allow pop-ups to print.');
        return null;
    }
    return printWindow;
}

function writeAndPrint(printWindow, title, bodyHtml) {
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(title)}</title>
            <style>${CLINIC_PRINT_STYLES}</style>
        </head>
        <body>${bodyHtml}</body>
        </html>
    `);
    printWindow.document.close();

    // Printing immediately after document.close() can fire before the
    // letterhead logo image has actually loaded, so it shows up blank -
    // wait for the window to finish loading everything first.
    let printed = false;
    const doPrint = () => {
        if (printed) return;
        printed = true;
        printWindow.focus();
        printWindow.print();
    };

    if (printWindow.document.readyState === 'complete') {
        doPrint();
    } else {
        printWindow.addEventListener('load', doPrint);
        // Fallback in case 'load' never fires for some reason.
        setTimeout(doPrint, 1000);
    }
}

// Mirrors the clinic's actual paper chart (Ecovet Animal Clinic letterhead,
// Client's Name / Pet's Name / Mobile# fields, then a Date | Treatment |
// Remarks log table) so the printout matches what staff already know.
function printConsultationReceipt(patient, consultation) {
    const printWindow = openClinicPrintWindow();
    if (!printWindow) return;

    const { treatmentHtml, remarksHtml } = buildConsultationCells(consultation);

    const blankRows = Array.from({ length: 4 }, () => `
        <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    `).join('');

    const bodyHtml = `
        ${clinicLetterheadHtml(patient)}
        <table class="log">
            <thead>
                <tr><th>Date</th><th>Treatment</th><th>Remarks</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td>${formatDate(consultation.date)}</td>
                    <td>${treatmentHtml}</td>
                    <td>${remarksHtml}</td>
                </tr>
                ${blankRows}
            </tbody>
        </table>
        ${consultationAttachmentsHtml(consultation)}
        <p class="footer">Printed ${formatDate(todayIso())} - Vet Vision Clinic Management System</p>
    `;

    writeAndPrint(printWindow, `${patient.petName} - Ecovet Animal Clinic`, bodyHtml);
}

// Prints every consultation on file for this patient as one running log,
// same layout as the physical chart when a page fills up with visits.
function printPatientHistory(patient) {
    if (!patient.consultations || patient.consultations.length === 0) {
        showToast('No consultations logged yet for this patient.');
        return;
    }

    const printWindow = openClinicPrintWindow();
    if (!printWindow) return;

    const sorted = [...patient.consultations].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    let grandTotal = 0;
    const rows = sorted.map(c => {
        const { treatmentHtml, remarksHtml, total } = buildConsultationCells(c);
        grandTotal += total;
        return `
            <tr>
                <td>${formatDate(c.date)}</td>
                <td>${treatmentHtml}</td>
                <td>${remarksHtml}</td>
            </tr>
        `;
    }).join('');

    // Unlike the single-visit receipt, the full history doesn't dump every
    // blood test / waiver image on the page - with many visits that's a lot
    // of heavy inline images, which is also what was making the letterhead
    // logo print blank (see writeAndPrint). The Remarks column still notes
    // when a visit has one on file.
    const bodyHtml = `
        ${clinicLetterheadHtml(patient)}
        <table class="log">
            <thead>
                <tr><th>Date</th><th>Treatment</th><th>Remarks</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            ${grandTotal ? `
                <tfoot>
                    <tr><td>&nbsp;</td><td>Grand total</td><td>${formatPrice(grandTotal)}</td></tr>
                </tfoot>
            ` : ''}
        </table>
        <p class="footer">Printed ${formatDate(todayIso())} - Vet Vision Clinic Management System</p>
    `;

    writeAndPrint(printWindow, `${patient.petName} - Full history - Ecovet Animal Clinic`, bodyHtml);
}

function renderAvailedChips() {
    if (!availedChipList) return;

    if (pendingAvailedItems.length === 0) {
        availedChipList.innerHTML = '';
        return;
    }

    availedChipList.innerHTML = pendingAvailedItems.map((item, index) => `
        <span class="availed-chip type-${item.type.toLowerCase()}">
            ${escapeHtml(item.type)}: ${escapeHtml(item.name)} — ${formatPrice(item.price)}
            <button type="button" class="availed-chip-remove" data-index="${index}" aria-label="Remove ${escapeHtml(item.name)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </span>
    `).join('');

    const total = pendingAvailedItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
    availedChipList.insertAdjacentHTML('beforeend', `<span class="availed-total">Total: ${formatPrice(total)}</span>`);
}

function populateAvailedItemOptions(type) {
    if (!availedItemField) return;

    if (!type) {
        availedItemField.innerHTML = '<option value="" disabled selected hidden>Select type first</option>';
        availedItemField.disabled = true;
        return;
    }

    const options = type === 'Service'
        ? CLINIC_SERVICES
        : getInventoryProducts().map(p => p.name).sort((a, b) => a.localeCompare(b));

    if (options.length === 0) {
        availedItemField.innerHTML = '<option value="" disabled selected hidden>No products in inventory yet</option>';
        availedItemField.disabled = true;
        return;
    }

    availedItemField.innerHTML = '<option value="" disabled selected hidden>Select item</option>'
        + options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    availedItemField.disabled = false;
}

// Same list as the Service item dropdown, so a flagged follow-up ("Vaccination")
// is guaranteed to match what gets picked when it's actually availed later.
function populateFollowUpNoteOptions() {
    if (!consultFollowUpNoteField) return;

    consultFollowUpNoteField.innerHTML = '<option value="" disabled selected hidden>Select service</option>'
        + CLINIC_SERVICES.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
}

function resetAvailedPicker() {
    pendingAvailedItems = [];
    renderAvailedChips();
    if (availedTypeField) availedTypeField.value = '';
    if (availedPriceField) availedPriceField.value = '';
    populateAvailedItemOptions('');
}

function resetBloodTestField() {
    currentBloodTestDataUrl = null;
    currentBloodTestName = '';
    if (bloodTestInput) bloodTestInput.value = '';
    if (bloodTestPreviewWrap) bloodTestPreviewWrap.hidden = true;
    if (bloodTestPreviewName) bloodTestPreviewName.textContent = '';
}

if (bloodTestInput) {
    bloodTestInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            currentBloodTestDataUrl = e.target.result;
            currentBloodTestName = file.name;
            bloodTestPreviewName.textContent = file.name;
            bloodTestPreviewWrap.hidden = false;
        };
        reader.readAsDataURL(file);
    });
}

if (bloodTestRemoveBtn) {
    bloodTestRemoveBtn.addEventListener('click', resetBloodTestField);
}

function resetWaiverField() {
    currentWaiverDataUrl = null;
    currentWaiverName = '';
    if (waiverInput) waiverInput.value = '';
    if (waiverPreviewWrap) waiverPreviewWrap.hidden = true;
    if (waiverPreviewName) waiverPreviewName.textContent = '';
}

if (waiverInput) {
    waiverInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            currentWaiverDataUrl = e.target.result;
            currentWaiverName = file.name;
            waiverPreviewName.textContent = file.name;
            waiverPreviewWrap.hidden = false;
        };
        reader.readAsDataURL(file);
    });
}

if (waiverRemoveBtn) {
    waiverRemoveBtn.addEventListener('click', resetWaiverField);
}

function resetFollowUpNoteField() {
    if (followUpNoteGroup) followUpNoteGroup.hidden = true;
    if (consultFollowUpNoteField) {
        consultFollowUpNoteField.required = false;
        consultFollowUpNoteField.value = '';
    }
}

if (consultFollowUpField) {
    consultFollowUpField.addEventListener('change', function () {
        if (this.checked) {
            followUpNoteGroup.hidden = false;
            consultFollowUpNoteField.required = true;
            consultFollowUpNoteField.focus();
        } else {
            resetFollowUpNoteField();
        }
    });
}

function resetConsultationForm() {
    consultationForm.reset();
    resetAvailedPicker();
    resetBloodTestField();
    resetWaiverField();
    resetFollowUpNoteField();
    consultDateField.value = todayIso();
}

function openPatientDetailModal(patient) {
    currentDetailPatientId = patient.id;
    renderPatientDetailInfo(patient);
    resetConsultationForm();
    patientDetailModalOverlay.classList.add('show');
}

function closePatientDetailModal() {
    patientDetailModalOverlay.classList.remove('show');
    currentDetailPatientId = null;
}

function openPatientHistoryModal(patient) {
    historyPetNameSub.textContent = `${patient.petName} — ${patient.ownerName} ${patient.ownerSurname}`;
    renderConsultationHistory(patient);
    patientHistoryModalOverlay.classList.add('show');
}

function closePatientHistoryModal() {
    patientHistoryModalOverlay.classList.remove('show');
}

if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', function () {
        const patient = getCurrentDetailPatient();
        if (patient) openPatientHistoryModal(patient);
    });
}

if (printAllHistoryBtn) {
    printAllHistoryBtn.addEventListener('click', function () {
        const patient = getCurrentDetailPatient();
        if (patient) printPatientHistory(patient);
    });
}

if (patientHistoryModalClose) {
    patientHistoryModalClose.addEventListener('click', closePatientHistoryModal);
}

if (patientHistoryModalOverlay) {
    patientHistoryModalOverlay.addEventListener('click', e => {
        if (e.target === patientHistoryModalOverlay) closePatientHistoryModal();
    });
}

if (availedTypeField) {
    availedTypeField.addEventListener('change', function () {
        populateAvailedItemOptions(this.value);
    });
}

if (availedAddBtn) {
    availedAddBtn.addEventListener('click', function () {
        const type = availedTypeField.value;
        const name = availedItemField.value;
        const price = Number(availedPriceField.value) || 0;

        if (!type || !name) {
            showToast('Pick a type and an item first.');
            return;
        }

        pendingAvailedItems.push({ type, name, price });
        renderAvailedChips();
        availedItemField.value = '';
        availedPriceField.value = '';
    });
}

if (availedChipList) {
    availedChipList.addEventListener('click', function (e) {
        const removeBtn = e.target.closest('.availed-chip-remove');
        if (!removeBtn) return;

        pendingAvailedItems.splice(Number(removeBtn.dataset.index), 1);
        renderAvailedChips();
    });
}

if (patientDetailModalClose) {
    patientDetailModalClose.addEventListener('click', closePatientDetailModal);
}

if (patientDetailModalOverlay) {
    patientDetailModalOverlay.addEventListener('click', e => {
        if (e.target === patientDetailModalOverlay) closePatientDetailModal();
    });
}

if (detailEditBtn) {
    detailEditBtn.addEventListener('click', function () {
        const patient = getCurrentDetailPatient();
        closePatientDetailModal();
        if (patient) openEditModal(patient);
    });
}

if (cancelConsultBtn) {
    cancelConsultBtn.addEventListener('click', function () {
        resetConsultationForm();
        showToast('Consultation entry cleared.');
    });
}

if (consultationForm) {
    consultationForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const patient = getCurrentDetailPatient();
        if (!patient) return;

        const followUp = consultFollowUpField.checked;
        const followUpNote = followUp ? consultFollowUpNoteField.value.trim() : '';

        const consultation = {
            id: nextConsultationId++,
            date: consultDateField.value,
            weight: consultWeightField.value.trim(),
            notes: consultNotesField.value.trim(),
            services: pendingAvailedItems.map(item => `${item.type}: ${item.name} — ${formatPrice(item.price)}`).join(', '),
            availedItems: pendingAvailedItems.slice(),
            totalPrice: pendingAvailedItems.reduce((sum, item) => sum + Number(item.price || 0), 0),
            remarks: consultRemarksField.value.trim(),
            bloodTestImage: currentBloodTestDataUrl,
            bloodTestName: currentBloodTestName,
            waiverImage: currentWaiverDataUrl,
            waiverName: currentWaiverName,
            followUp,
            followUpNote
        };

        patient.consultations.push(consultation);

        if (followUp) {
            // Raises a new follow-up (or replaces the pending one).
            patient.status = 'Follow-up needed';
            patient.followUpNote = followUpNote;
        } else if (
            patient.status === 'Follow-up needed'
            && pendingAvailedItems.some(item => item.type === 'Service' && item.name === patient.followUpNote)
        ) {
            // Resolves the pending follow-up only when the same service that
            // was due actually got availed on this visit.
            patient.status = 'Active';
            patient.followUpNote = '';
        }

        savePatients();
        closePatientDetailModal();
        renderPatients();
        renderStatusFilter();
        showToast('Consultation added successfully.', 'Print', () => printConsultationReceipt(patient, consultation));
    });
}

if (consultationHistory) {
    consultationHistory.addEventListener('click', function (e) {
        const printBtn = e.target.closest('.consultation-print-btn');
        const deleteBtn = e.target.closest('.consultation-delete-btn');
        if (!printBtn && !deleteBtn) return;

        const patient = getCurrentDetailPatient();
        if (!patient) return;

        if (printBtn) {
            const consultation = patient.consultations.find(c => c.id === Number(printBtn.dataset.id));
            if (consultation) printConsultationReceipt(patient, consultation);
            return;
        }

        const id = Number(deleteBtn.dataset.id);
        if (confirm('Delete this consultation entry?')) {
            patient.consultations = patient.consultations.filter(c => c.id !== id);
            savePatients();
            renderPatientDetailInfo(patient);
            renderConsultationHistory(patient);
            renderPatients();
            showToast('Consultation entry deleted.');
        }
    });
}

// ==================== SEARCH & BRANCH ====================

if (patientSearch) {
    patientSearch.addEventListener('input', function () {
        searchTerm = this.value.trim().toLowerCase();
        renderPatients();
    });
}

if (branchFilterSelect) {
    branchFilterSelect.dataset.filterWired = 'true';
    branchFilterSelect.addEventListener('change', function () {
        selectedBranch = this.value;
        renderPatients();
    });
}

// ==================== STATUS FILTER POPOVER ====================

const filterBtn = document.getElementById('filterBtn');
const filterPopover = document.getElementById('filterPopover');

if (filterBtn && filterPopover) {
    filterPopover.addEventListener('click', e => e.stopPropagation());

    filterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = filterPopover.classList.contains('show');
        filterPopover.classList.toggle('show', !isOpen);
        filterBtn.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', () => {
        filterPopover.classList.remove('show');
        filterBtn.setAttribute('aria-expanded', 'false');
    });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closePatientModal();
        closePatientHistoryModal();
        closePatientDetailModal();
        if (filterPopover) {
            filterPopover.classList.remove('show');
            filterBtn.setAttribute('aria-expanded', 'false');
        }
    }
});

// ==================== INIT ====================

renderPatients();
renderStatusFilter();
populateFollowUpNoteOptions();

// Landing here from a notification bell click on another page (see
// dashboard.js) links to patients.html?followUp=<id> - jump straight to
// that patient instead of leaving the admin to find them in the table.
const followUpParamId = Number(new URLSearchParams(window.location.search).get('followUp'));
if (followUpParamId) {
    const targetPatient = patients.find(p => p.id === followUpParamId);
    if (targetPatient) openPatientDetailModal(targetPatient);
}

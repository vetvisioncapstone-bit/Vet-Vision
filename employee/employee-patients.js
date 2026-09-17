// ==================== STATE ====================
// Reads/writes the exact same localStorage key the admin Patients page
// uses, so a patient added here shows up there and vice versa. Scoped to
// this employee's own branch - they never see other branches' patients.
// Only the fields the admin's full page also relies on are kept here, so a
// patient created on this simplified form still renders correctly there.

const PATIENTS_STORAGE_KEY = 'vvPatients';

function loadAllPatients() {
    try {
        const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveAllPatients(all) {
    try {
        localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(all));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let patients = loadAllPatients();
let nextPatientId = patients.reduce((max, p) => Math.max(max, p.id + 1), 1);
let nextConsultationId = patients.reduce(
    (max, p) => (p.consultations || []).reduce((m, c) => Math.max(m, c.id + 1), max),
    1
);
let editingPatientId = null;
let currentDetailPatientId = null;
let searchTerm = '';

// ==================== DOM REFS ====================

const patientTableBody = document.getElementById('patientTableBody');
const statTotalPatients = document.getElementById('statTotalPatients');
const statFollowUpNeeded = document.getElementById('statFollowUpNeeded');
const patientSearch = document.getElementById('patientSearch');

const patientModalOverlay = document.getElementById('patientModalOverlay');
const patientModalTitle = document.getElementById('patientModalTitle');
const patientModalClose = document.getElementById('patientModalClose');
const patientCancelBtn = document.getElementById('patientCancelBtn');
const patientSaveBtn = document.getElementById('patientSaveBtn');
const patientForm = document.getElementById('patientForm');
const newPatientBtn = document.getElementById('newPatientBtn');

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

const patientDetailModalOverlay = document.getElementById('patientDetailModalOverlay');
const patientDetailModalClose = document.getElementById('patientDetailModalClose');
const detailPetName = document.getElementById('detailPetName');
const detailOwnerSub = document.getElementById('detailOwnerSub');
const detailOwnerEmail = document.getElementById('detailOwnerEmail');
const detailOwnerMobile = document.getElementById('detailOwnerMobile');
const detailPetSpecieBreed = document.getElementById('detailPetSpecieBreed');
const detailStatusPill = document.getElementById('detailStatusPill');
const detailEditBtn = document.getElementById('detailEditBtn');
const detailDeleteBtn = document.getElementById('detailDeleteBtn');

const consultationForm = document.getElementById('consultationForm');
const consultDateField = document.getElementById('consultDate');
const consultWeightField = document.getElementById('consultWeight');
const consultNotesField = document.getElementById('consultNotes');
const consultRemarksField = document.getElementById('consultRemarks');
const consultationHistory = document.getElementById('consultationHistory');

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

function getLastVisitDate(patient) {
    if (!patient.consultations || patient.consultations.length === 0) return patient.createdAt;
    return patient.consultations.reduce((latest, c) => (c.date > latest ? c.date : latest), patient.consultations[0].date);
}

function getStatusClass(status) {
    switch (status) {
        case 'Active': return 'status-ok';
        case 'Follow-up needed': return 'status-follow-up';
        default: return 'status-inactive';
    }
}

function getBranchPatients() {
    const branch = getEmployeeBranch();
    return patients.filter(p => p.branch === branch);
}

function getVisiblePatients() {
    return getBranchPatients().filter(p => {
        if (!searchTerm) return true;
        const ownerFullName = `${p.ownerName} ${p.ownerSurname}`.toLowerCase();
        return p.petName.toLowerCase().includes(searchTerm)
            || ownerFullName.includes(searchTerm)
            || p.ownerEmail.toLowerCase().includes(searchTerm);
    });
}

// ==================== RENDER ====================

function renderStats() {
    const branchPatients = getBranchPatients();
    statTotalPatients.textContent = branchPatients.length;
    statFollowUpNeeded.textContent = branchPatients.filter(p => p.status === 'Follow-up needed').length;
}

function renderPatients() {
    const visible = getVisiblePatients();
    const branchPatients = getBranchPatients();

    if (branchPatients.length === 0) {
        patientTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No patients for this branch yet. Click "+ New" to add one.</td></tr>';
    } else if (visible.length === 0) {
        patientTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No patients match your search.</td></tr>';
    } else {
        patientTableBody.innerHTML = visible.map(p => `
            <tr class="patient-row" data-id="${p.id}">
                <td>${escapeHtml(p.petName)}</td>
                <td>${escapeHtml(p.ownerName)} ${escapeHtml(p.ownerSurname)}</td>
                <td>${escapeHtml(p.petSpecie)}</td>
                <td>${formatDate(getLastVisitDate(p))}</td>
                <td><span class="status-pill ${getStatusClass(p.status)}">${escapeHtml(p.status)}</span></td>
                <td class="action-col"></td>
            </tr>
        `).join('');
    }

    renderStats();
}

// ==================== NEW / EDIT PATIENT MODAL ====================

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

    patientModalTitle.textContent = 'Edit patient';
    patientSaveBtn.textContent = 'Save changes';
    patientModalOverlay.classList.add('show');
}

function closePatientModal() {
    patientModalOverlay.classList.remove('show');
    patientForm.reset();
    editingPatientId = null;
}

if (newPatientBtn) newPatientBtn.addEventListener('click', openAddModal);
if (patientModalClose) patientModalClose.addEventListener('click', closePatientModal);
if (patientCancelBtn) patientCancelBtn.addEventListener('click', closePatientModal);

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
            branch: getEmployeeBranch()
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

        saveAllPatients(patients);
        closePatientModal();
        renderPatients();

        if (newPatient) openPatientDetailModal(newPatient);
    });
}

// ==================== TABLE ROW INTERACTIONS ====================

if (patientTableBody) {
    patientTableBody.addEventListener('click', function (e) {
        const row = e.target.closest('.patient-row');
        if (!row) return;
        const patient = patients.find(p => p.id === Number(row.dataset.id));
        if (patient) openPatientDetailModal(patient);
    });
}

// ==================== PATIENT DETAIL MODAL ====================

function getCurrentDetailPatient() {
    return patients.find(p => p.id === currentDetailPatientId) || null;
}

function renderPatientDetailInfo(patient) {
    detailPetName.textContent = patient.petName;
    detailOwnerSub.textContent = `${patient.ownerName} ${patient.ownerSurname}`;
    detailOwnerEmail.textContent = patient.ownerEmail;
    detailOwnerMobile.textContent = patient.ownerMobile;
    detailPetSpecieBreed.textContent = `${patient.petSpecie} — ${patient.petBreed}`;
    detailStatusPill.textContent = patient.status;
    detailStatusPill.className = `status-pill ${getStatusClass(patient.status)}`;
}

function renderConsultationHistory(patient) {
    if (!patient.consultations || patient.consultations.length === 0) {
        consultationHistory.innerHTML = '<p class="empty-state">No consultations logged yet.</p>';
        return;
    }

    const sorted = [...patient.consultations].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    consultationHistory.innerHTML = sorted.map(c => `
        <div class="consultation-item">
            <div class="consultation-item-head">
                <span>
                    <span class="consultation-date">${formatDate(c.date)}</span>
                    ${c.weight ? `<span class="consultation-weight">${escapeHtml(c.weight)}</span>` : ''}
                </span>
            </div>
            <p class="consultation-field">${escapeHtml(c.notes)}</p>
            ${c.remarks ? `<p class="consultation-remarks">${escapeHtml(c.remarks)}</p>` : ''}
        </div>
    `).join('');
}

function resetConsultationForm() {
    consultationForm.reset();
    consultDateField.value = todayIso();
}

function openPatientDetailModal(patient) {
    currentDetailPatientId = patient.id;
    renderPatientDetailInfo(patient);
    renderConsultationHistory(patient);
    resetConsultationForm();
    patientDetailModalOverlay.classList.add('show');
}

function closePatientDetailModal() {
    patientDetailModalOverlay.classList.remove('show');
    currentDetailPatientId = null;
}

if (patientDetailModalClose) patientDetailModalClose.addEventListener('click', closePatientDetailModal);

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

if (detailDeleteBtn) {
    detailDeleteBtn.addEventListener('click', function () {
        const patient = getCurrentDetailPatient();
        if (!patient) return;
        if (confirm(`Send a request to the admin to delete "${patient.petName}"'s record?`)) {
            requestDelete('patient', patient.id, `${patient.petName} (${patient.ownerName} ${patient.ownerSurname})`);
            showToast(`Delete request for "${patient.petName}" sent to the admin.`);
            closePatientDetailModal();
        }
    });
}

if (consultationForm) {
    consultationForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const patient = getCurrentDetailPatient();
        if (!patient) return;

        const consultation = {
            id: nextConsultationId++,
            date: consultDateField.value,
            weight: consultWeightField.value.trim(),
            notes: consultNotesField.value.trim(),
            remarks: consultRemarksField.value.trim()
        };

        patient.consultations = patient.consultations || [];
        patient.consultations.push(consultation);

        saveAllPatients(patients);
        resetConsultationForm();
        renderPatientDetailInfo(patient);
        renderConsultationHistory(patient);
        renderPatients();
        showToast('Consultation logged.');
    });
}

// ==================== SEARCH ====================

if (patientSearch) {
    patientSearch.addEventListener('input', function () {
        searchTerm = this.value.trim().toLowerCase();
        renderPatients();
    });
}

// A delete approved elsewhere (or a change made in another tab) touches
// this same localStorage key - pick that up without a full reload.
window.addEventListener('storage', e => {
    if (e.key === PATIENTS_STORAGE_KEY) {
        patients = loadAllPatients();
        renderPatients();
    }
});

// ==================== ESCAPE CLOSES MODALS ====================

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closePatientModal();
        closePatientDetailModal();
    }
});

// ==================== INIT ====================

renderPatients();

// Landing here from a notification bell click on another page links to
// employee-patients.html?followUp=<id> - jump straight to that patient.
const followUpParamId = Number(new URLSearchParams(window.location.search).get('followUp'));
if (followUpParamId) {
    const targetPatient = patients.find(p => p.id === followUpParamId);
    if (targetPatient) openPatientDetailModal(targetPatient);
}

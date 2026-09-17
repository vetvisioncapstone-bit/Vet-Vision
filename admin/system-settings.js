// ==================== STATE ====================
// In-memory only - there's no database yet, so this resets on reload.
// These values aren't read by any other page yet (inventory, forecasting,
// etc. still use their own hardcoded numbers) - this page just captures
// and previews the configuration.

const settings = {
    lowStockThreshold: 20,
    highDemandThreshold: 100,
    loyalVisitCount: 8,
    movingAverageWindow: 3,
    forecastHorizon: 1,
    defaultForecastBranch: 'All Branches',
    lowStockEmailAlerts: true,
    followUpReminders: true,
    autoDailyBackup: false
};

// ==================== DOM REFS ====================

const lowStockThresholdField = document.getElementById('lowStockThreshold');
const highDemandThresholdField = document.getElementById('highDemandThreshold');
const loyalVisitCountField = document.getElementById('loyalVisitCount');
const movingAverageWindowField = document.getElementById('movingAverageWindow');
const forecastHorizonField = document.getElementById('forecastHorizon');
const defaultForecastBranchField = document.getElementById('defaultForecastBranch');

const lowStockEmailToggle = document.getElementById('lowStockEmailToggle');
const followUpReminderToggle = document.getElementById('followUpReminderToggle');
const autoBackupToggle = document.getElementById('autoBackupToggle');

const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');

const adminSummaryAvatar = document.getElementById('adminSummaryAvatar');
const adminSummaryName = document.getElementById('adminSummaryName');
const adminSummaryEmail = document.getElementById('adminSummaryEmail');

const openAdminEditBtn = document.getElementById('openAdminEditBtn');
const adminEditModalOverlay = document.getElementById('adminEditModalOverlay');
const adminEditModalClose = document.getElementById('adminEditModalClose');
const adminEditModalTitle = document.getElementById('adminEditModalTitle');

const adminVerifyForm = document.getElementById('adminVerifyForm');
const adminVerifyPasswordField = document.getElementById('adminVerifyPassword');
const adminVerifyError = document.getElementById('adminVerifyError');

const adminEditForm = document.getElementById('adminEditForm');
const adminNameField = document.getElementById('adminName');
const adminEmailField = document.getElementById('adminEmail');
const adminNewPasswordField = document.getElementById('adminNewPassword');
const adminConfirmPasswordField = document.getElementById('adminConfirmPassword');
const adminEditPasswordError = document.getElementById('adminEditPasswordError');

const adminPhotoInput = document.getElementById('adminPhotoInput');
const adminPhotoPreview = document.getElementById('adminPhotoPreview');
const adminPhotoPlaceholder = document.getElementById('adminPhotoPlaceholder');
const adminPhotoRemove = document.getElementById('adminPhotoRemove');

let currentAdminPhotoDataUrl = null;

// ==================== ADMIN ACCOUNT ====================
// getAdminProfile / saveAdminProfile / applyAdminProfileToTopbar come from
// dashboard.js, which is loaded on this page before this file.
//
// Flow: clicking "Update admin information" always opens on the password
// step first. Only a correct password reveals the name/email/password
// edit form - this is a client-side re-auth check, not real security
// (the password is readable in localStorage/script.js), but it stops
// someone who's just sitting at an already-logged-in session from
// changing the account without re-entering the password.

function renderAdminSummary() {
    const profile = getAdminProfile();
    adminSummaryAvatar.innerHTML = getAvatarHTML(profile);
    adminSummaryName.textContent = profile.name;
    adminSummaryEmail.textContent = profile.email;
}

renderAdminSummary();

function setAdminPhotoPreview(dataUrl) {
    if (dataUrl) {
        adminPhotoPreview.src = dataUrl;
        adminPhotoPreview.hidden = false;
        adminPhotoPlaceholder.hidden = true;
        adminPhotoRemove.hidden = false;
    } else {
        adminPhotoPreview.hidden = true;
        adminPhotoPreview.src = '';
        adminPhotoPlaceholder.hidden = false;
        adminPhotoRemove.hidden = true;
    }
}

if (adminPhotoInput) {
    adminPhotoInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            currentAdminPhotoDataUrl = e.target.result;
            setAdminPhotoPreview(currentAdminPhotoDataUrl);
        };
        reader.readAsDataURL(file);
    });
}

if (adminPhotoRemove) {
    adminPhotoRemove.addEventListener('click', function (e) {
        e.preventDefault();
        currentAdminPhotoDataUrl = null;
        adminPhotoInput.value = '';
        setAdminPhotoPreview(null);
    });
}

function showAdminVerifyStep() {
    adminEditModalTitle.textContent = 'Verify your password';
    adminVerifyForm.hidden = false;
    adminEditForm.hidden = true;
    adminVerifyError.hidden = true;
    adminVerifyForm.reset();
    adminVerifyPasswordField.focus();
}

function showAdminEditStep() {
    const profile = getAdminProfile();
    adminEditModalTitle.textContent = 'Update admin information';
    adminVerifyForm.hidden = true;
    adminEditForm.hidden = false;
    adminEditPasswordError.hidden = true;
    adminNameField.value = profile.name;
    adminEmailField.value = profile.email;
    adminNewPasswordField.value = '';
    adminConfirmPasswordField.value = '';
    currentAdminPhotoDataUrl = profile.photo;
    adminPhotoInput.value = '';
    setAdminPhotoPreview(profile.photo);
}

function openAdminEditModal() {
    showAdminVerifyStep();
    adminEditModalOverlay.classList.add('show');
}

function closeAdminEditModal() {
    adminEditModalOverlay.classList.remove('show');
}

if (openAdminEditBtn) {
    openAdminEditBtn.addEventListener('click', openAdminEditModal);
}

if (adminEditModalClose) {
    adminEditModalClose.addEventListener('click', closeAdminEditModal);
}

if (adminEditModalOverlay) {
    adminEditModalOverlay.addEventListener('click', e => {
        if (e.target === adminEditModalOverlay) closeAdminEditModal();
    });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAdminEditModal();
});

if (adminVerifyForm) {
    adminVerifyForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const profile = getAdminProfile();
        if (adminVerifyPasswordField.value !== profile.password) {
            adminVerifyError.hidden = false;
            adminVerifyPasswordField.classList.add('error');
            return;
        }

        showAdminEditStep();
    });

    adminVerifyPasswordField.addEventListener('input', function () {
        this.classList.remove('error');
        adminVerifyError.hidden = true;
    });
}

function wirePasswordToggle(btnId, inputEl) {
    const btn = document.getElementById(btnId);
    if (!btn || !inputEl) return;
    btn.addEventListener('click', () => {
        const isVisible = inputEl.getAttribute('type') === 'text';
        inputEl.setAttribute('type', isVisible ? 'password' : 'text');
        btn.classList.toggle('is-visible', !isVisible);
    });
}

wirePasswordToggle('toggleAdminVerifyPassword', adminVerifyPasswordField);
wirePasswordToggle('toggleAdminNewPassword', adminNewPasswordField);
wirePasswordToggle('toggleAdminConfirmPassword', adminConfirmPasswordField);

if (adminEditForm) {
    adminEditForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const name = adminNameField.value.trim();
        const email = adminEmailField.value.trim().toLowerCase();
        const newPassword = adminNewPasswordField.value;
        const confirmPassword = adminConfirmPasswordField.value;

        if (!name || !email) return;

        if (newPassword || confirmPassword) {
            if (newPassword.length < 8) {
                adminEditPasswordError.textContent = 'New password must be at least 8 characters.';
                adminEditPasswordError.hidden = false;
                return;
            }
            if (newPassword !== confirmPassword) {
                adminEditPasswordError.textContent = 'New password and confirmation don\'t match.';
                adminEditPasswordError.hidden = false;
                return;
            }
        }

        const profile = getAdminProfile();
        const updated = { ...profile, name, email, photo: currentAdminPhotoDataUrl };
        if (newPassword) updated.password = newPassword;

        saveAdminProfile(updated);
        applyAdminProfileToTopbar();
        renderAdminSummary();
        closeAdminEditModal();
        showToast('Admin account updated.');
    });
}

// ==================== NUMBER FIELDS ====================

function wireNumberField(field, key, label, min) {
    if (!field) return;
    field.addEventListener('change', function () {
        let value = Math.round(Number(this.value));
        if (Number.isNaN(value) || value < min) {
            value = min;
        }
        this.value = value;
        settings[key] = value;
        showToast(`${label} set to ${value}.`);
    });
}

wireNumberField(lowStockThresholdField, 'lowStockThreshold', 'Low stock alert threshold', 0);
wireNumberField(highDemandThresholdField, 'highDemandThreshold', 'High demand threshold', 0);
wireNumberField(loyalVisitCountField, 'loyalVisitCount', 'Loyal customer visit count', 0);
wireNumberField(movingAverageWindowField, 'movingAverageWindow', 'Moving average window', 1);
wireNumberField(forecastHorizonField, 'forecastHorizon', 'Forecast horizon', 1);

// ==================== SELECT ====================

if (defaultForecastBranchField) {
    defaultForecastBranchField.addEventListener('change', function () {
        settings.defaultForecastBranch = this.value;
        showToast(`Default forecast branch set to ${this.value}.`);
    });
}

// ==================== TOGGLES ====================

function wireToggle(toggle, key, label) {
    if (!toggle) return;
    toggle.addEventListener('change', function () {
        settings[key] = this.checked;
        showToast(`${label} ${this.checked ? 'enabled' : 'disabled'}.`);
    });
}

wireToggle(lowStockEmailToggle, 'lowStockEmailAlerts', 'Low stock email alerts');
wireToggle(followUpReminderToggle, 'followUpReminders', 'Follow-up reminders');
wireToggle(autoBackupToggle, 'autoDailyBackup', 'Auto daily backup');

// ==================== EXPORT ====================

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function settingsToCsv() {
    const rows = [['Setting', 'Value']];
    Object.entries(settings).forEach(([key, value]) => rows.push([key, String(value)]));
    return rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', function () {
        downloadFile('vet-vision-settings.csv', settingsToCsv(), 'text/csv');
        showToast('Settings exported as CSV.');
    });
}

if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', function () {
        downloadFile('vet-vision-settings.json', JSON.stringify(settings, null, 2), 'application/json');
        showToast('Settings exported as JSON.');
    });
}

// ==================== DEEP LINK ====================
// Clicking the name/avatar in the profile popover (any page) links here
// with ?openAdminEdit=1 so the edit flow opens immediately instead of
// landing on a page the admin then has to click "Update admin
// information" on again.

if (new URLSearchParams(window.location.search).has('openAdminEdit')) {
    openAdminEditModal();
    history.replaceState(null, '', window.location.pathname);
}

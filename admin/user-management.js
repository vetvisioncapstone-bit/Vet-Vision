// ==================== STATE ====================
// Persisted to localStorage (there's no backend yet) so the login page
// (../script.js) and the employee portal can read who's a registered
// employee. Accounts created here are staff/employee accounts; the admin
// (junejerichohumarang@ecovet.ph) is the only one who can create them.
// The email doubles as the account's username - there's no separate
// username field.

const STAFF_ACCOUNTS_KEY = 'vvStaffAccounts';

function loadAccounts() {
    try {
        const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveAccounts() {
    try {
        localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let accounts = loadAccounts();
let nextAccountId = accounts.reduce((max, a) => Math.max(max, a.id + 1), 1);
let searchTerm = '';
let currentPhotoDataUrl = null;
let editingAccountId = null;

// ==================== DOM REFS ====================

const accountTableBody = document.getElementById('accountTableBody');
const accountSearch = document.getElementById('accountSearch');
const newAccountBtn = document.getElementById('newAccountBtn');
const sortableCols = document.querySelectorAll('.sortable-col');

const accountModalOverlay = document.getElementById('accountModalOverlay');
const accountModalClose = document.getElementById('accountModalClose');
const accountCancelBtn = document.getElementById('accountCancelBtn');
const accountForm = document.getElementById('accountForm');
const accountModalTitle = document.getElementById('accountModalTitle');
const accountModalSubtitle = document.getElementById('accountModalSubtitle');

const staffFullNameField = document.getElementById('staffFullName');
const staffAddressField = document.getElementById('staffAddress');
const staffEmailField = document.getElementById('staffEmail');
const staffEmailHint = document.getElementById('staffEmailHint');
const staffMobileField = document.getElementById('staffMobile');
const staffPositionField = document.getElementById('staffPosition');
const agreeTermsField = document.getElementById('agreeTerms');
const agreeDataPrivacyField = document.getElementById('agreeDataPrivacy');
const staffPasswordField = document.getElementById('staffPassword');
const staffConfirmPasswordField = document.getElementById('staffConfirmPassword');
const passwordEditHint = document.getElementById('passwordEditHint');
const staffLocationField = document.getElementById('staffLocation');

const accessBadge = document.getElementById('accessBadge');
const accessBadgeText = document.getElementById('accessBadgeText');
const passwordHints = document.querySelectorAll('.password-hints li');
const passwordStrengthMsg = document.getElementById('passwordStrengthMsg');
const passwordMatchMsg = document.getElementById('passwordMatchMsg');
const accountSubmitBtn = document.getElementById('accountSubmitBtn');

const staffPhotoLabel = document.getElementById('staffPhotoLabel');
const staffPhotoInput = document.getElementById('staffPhotoInput');
const staffPhotoPreview = document.getElementById('staffPhotoPreview');
const staffPhotoPlaceholder = document.getElementById('staffPhotoPlaceholder');
const staffPhotoRemove = document.getElementById('staffPhotoRemove');

// ==================== HELPERS ====================

function validateStaffEmail() {
    const email = staffEmailField.value.trim();

    if (email === '') {
        staffEmailField.classList.remove('error', 'success');
        staffEmailHint.classList.remove('show');
        return true;
    }

    if (!email.toLowerCase().endsWith('@ecovet.ph')) {
        staffEmailField.classList.add('error');
        staffEmailField.classList.remove('success');
        staffEmailHint.classList.add('show');
        return false;
    } else {
        staffEmailField.classList.add('success');
        staffEmailField.classList.remove('error');
        staffEmailHint.classList.remove('show');
        return true;
    }
}

function resetStaffEmailValidation() {
    staffEmailField.classList.remove('error', 'success');
    staffEmailHint.classList.remove('show');
}

if (staffEmailField) {
    staffEmailField.addEventListener('blur', validateStaffEmail);
    staffEmailField.addEventListener('input', function () {
        if (this.classList.contains('error')) {
            this.classList.remove('error');
            staffEmailHint.classList.remove('show');
        }
    });
}

function getInitials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join('');
}

function getVisibleAccounts() {
    if (!searchTerm) return accounts;
    return accounts.filter(a =>
        a.name.toLowerCase().includes(searchTerm) ||
        a.email.toLowerCase().includes(searchTerm)
    );
}

// ==================== RENDER ====================

function renderAccounts() {
    const visible = getVisibleAccounts();

    if (accounts.length === 0) {
        accountTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No accounts yet. Click "+ New" to add one.</td></tr>';
        return;
    }

    if (visible.length === 0) {
        accountTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No accounts match your search.</td></tr>';
        return;
    }

    accountTableBody.innerHTML = visible.map(a => `
        <tr class="account-row" data-id="${a.id}">
            <td>${a.photo
                ? `<img class="account-avatar" src="${a.photo}" alt="${a.name}">`
                : `<span class="account-avatar">${getInitials(a.name)}</span>`}${a.name}</td>
            <td>${a.email}</td>
            <td>${a.branch}</td>
            <td><span class="role-pill">${a.position || 'Staff'}</span></td>
            <td>${a.lastLogin}</td>
            <td class="action-col">
                <div class="account-row-actions">
                    <button type="button" class="account-row-action-btn edit" data-id="${a.id}" aria-label="Edit account">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                    </button>
                    <button type="button" class="account-row-action-btn delete" data-id="${a.id}" aria-label="Delete account">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ==================== ACCOUNT MODAL ====================

function resetPasswordHints() {
    passwordHints.forEach(li => li.classList.remove('met'));
    passwordStrengthMsg.hidden = true;
    passwordMatchMsg.hidden = true;
}

function resetPasswordVisibility() {
    [staffPasswordField, staffConfirmPasswordField].forEach(field => {
        field.setAttribute('type', 'password');
    });
    [document.getElementById('toggleStaffPassword'), document.getElementById('toggleStaffConfirmPassword')].forEach(btn => {
        if (btn) btn.classList.remove('is-visible');
    });
}

function resetPhotoField() {
    currentPhotoDataUrl = null;
    staffPhotoInput.value = '';
    staffPhotoPreview.hidden = true;
    staffPhotoPreview.src = '';
    staffPhotoPlaceholder.hidden = false;
    staffPhotoRemove.hidden = true;
}

function setModalMode(isEditing) {
    accountModalTitle.textContent = isEditing ? 'Edit staff account' : 'Create an staff account';
    accountModalSubtitle.textContent = isEditing
        ? "Update this employee's details below:"
        : 'Please fill in the employee details below:';
    accountSubmitBtn.textContent = isEditing ? 'Save changes' : 'Submit';

    // Re-typing a password on every edit is unnecessary friction - leaving
    // it blank keeps the account's existing password.
    staffPasswordField.required = !isEditing;
    staffConfirmPasswordField.required = !isEditing;
    passwordEditHint.hidden = !isEditing;

    agreeTermsField.required = !isEditing;
    agreeDataPrivacyField.required = !isEditing;
    if (isEditing) {
        agreeTermsField.checked = true;
        agreeDataPrivacyField.checked = true;
    }
}

function openAccountModal() {
    editingAccountId = null;
    accountForm.reset();
    resetPasswordHints();
    resetPasswordVisibility();
    resetPhotoField();
    resetStaffEmailValidation();
    setModalMode(false);
    accessBadge.hidden = true;
    accountSubmitBtn.disabled = true;
    accountModalOverlay.classList.add('show');
}

function openEditAccountModal(account) {
    editingAccountId = account.id;
    accountForm.reset();
    resetPasswordHints();
    resetPasswordVisibility();
    resetStaffEmailValidation();

    staffFullNameField.value = account.name;
    staffAddressField.value = account.address || '';
    staffEmailField.value = account.email;
    staffMobileField.value = account.mobile || '';
    staffLocationField.value = account.branch;
    staffPositionField.value = account.position || '';

    if (account.photo) {
        currentPhotoDataUrl = account.photo;
        staffPhotoPreview.src = account.photo;
        staffPhotoPreview.hidden = false;
        staffPhotoPlaceholder.hidden = true;
        staffPhotoRemove.hidden = false;
    } else {
        resetPhotoField();
    }

    if (account.branch) {
        accessBadgeText.textContent = `${account.branch} — Staff access`;
        accessBadge.hidden = false;
    } else {
        accessBadge.hidden = true;
    }

    setModalMode(true);
    validateForm();
    accountModalOverlay.classList.add('show');
}

function closeAccountModal() {
    accountModalOverlay.classList.remove('show');
    accountForm.reset();
    resetPasswordHints();
    resetPasswordVisibility();
    resetPhotoField();
    resetStaffEmailValidation();
    setModalMode(false);
    accessBadge.hidden = true;
    accountSubmitBtn.disabled = true;
    editingAccountId = null;
}

if (newAccountBtn) {
    newAccountBtn.addEventListener('click', openAccountModal);
}

if (accountModalClose) {
    accountModalClose.addEventListener('click', closeAccountModal);
}

if (accountCancelBtn) {
    accountCancelBtn.addEventListener('click', closeAccountModal);
}

if (accountModalOverlay) {
    accountModalOverlay.addEventListener('click', e => {
        if (e.target === accountModalOverlay) closeAccountModal();
    });
}

// ==================== PROFILE PHOTO UPLOAD ====================

if (staffPhotoInput) {
    staffPhotoInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            currentPhotoDataUrl = e.target.result;
            staffPhotoPreview.src = currentPhotoDataUrl;
            staffPhotoPreview.hidden = false;
            staffPhotoPlaceholder.hidden = true;
            staffPhotoRemove.hidden = false;
        };
        reader.readAsDataURL(file);
    });
}

if (staffPhotoRemove) {
    staffPhotoRemove.addEventListener('click', function (e) {
        e.preventDefault();
        resetPhotoField();
    });
}

// ==================== PASSWORD VISIBILITY TOGGLES ====================

function wirePasswordToggle(btnId, inputEl) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
        const isVisible = inputEl.getAttribute('type') === 'text';
        inputEl.setAttribute('type', isVisible ? 'password' : 'text');
        btn.classList.toggle('is-visible', !isVisible);
    });
}

wirePasswordToggle('toggleStaffPassword', staffPasswordField);
wirePasswordToggle('toggleStaffConfirmPassword', staffConfirmPasswordField);

// ==================== PASSWORD STRENGTH HINTS ====================

if (staffPasswordField) {
    staffPasswordField.addEventListener('input', function () {
        const value = this.value;
        const rules = {
            length: value.length >= 8,
            upper: /[A-Z]/.test(value),
            lower: /[a-z]/.test(value),
            number: /[0-9]/.test(value),
            special: /[^A-Za-z0-9]/.test(value)
        };

        passwordHints.forEach(li => {
            li.classList.toggle('met', !!rules[li.dataset.rule]);
        });

        if (value) {
            const strong = Object.values(rules).every(Boolean);
            passwordStrengthMsg.textContent = strong ? '✓ Strong password' : 'Password is too weak';
            passwordStrengthMsg.classList.toggle('is-strong', strong);
            passwordStrengthMsg.hidden = false;
        } else {
            passwordStrengthMsg.hidden = true;
        }

        updatePasswordMatchMsg();
    });
}

function updatePasswordMatchMsg() {
    const value = staffConfirmPasswordField.value;

    if (!value) {
        passwordMatchMsg.hidden = true;
        return;
    }

    const match = value === staffPasswordField.value;
    passwordMatchMsg.textContent = match ? '✓ Passwords match' : 'Passwords do not match';
    passwordMatchMsg.classList.toggle('is-match', match);
    passwordMatchMsg.classList.toggle('is-mismatch', !match);
    passwordMatchMsg.hidden = false;
}

if (staffConfirmPasswordField) {
    staffConfirmPasswordField.addEventListener('input', updatePasswordMatchMsg);
}

// ==================== ACCESS BADGE ====================

if (staffLocationField) {
    staffLocationField.addEventListener('change', function () {
        if (this.value) {
            accessBadgeText.textContent = `${this.value} — Staff access`;
            accessBadge.hidden = false;
        } else {
            accessBadge.hidden = true;
        }
    });
}

// ==================== SUBMIT BUTTON VALIDATION ====================

function isPasswordStrong(value) {
    return value.length >= 8 &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /[0-9]/.test(value) &&
        /[^A-Za-z0-9]/.test(value);
}

function validateForm() {
    const passwordValue = staffPasswordField.value;
    const passwordOptionalAndBlank = Boolean(editingAccountId) && passwordValue === '';
    const strong = passwordOptionalAndBlank || isPasswordStrong(passwordValue);
    const match = passwordOptionalAndBlank || (passwordValue.length > 0 && passwordValue === staffConfirmPasswordField.value);
    accountSubmitBtn.disabled = !(accountForm.checkValidity() && strong && match);
}

if (accountForm) {
    accountForm.addEventListener('input', validateForm);
    accountForm.addEventListener('change', validateForm);
}

// ==================== FORM SUBMISSION ====================

if (accountForm) {
    accountForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const email = staffEmailField.value.trim().toLowerCase();
        const password = staffPasswordField.value;
        const confirmPassword = staffConfirmPasswordField.value;
        const isEditing = Boolean(editingAccountId);
        const keepingExistingPassword = isEditing && password === '';

        if (!validateStaffEmail()) {
            showToast('Staff email must be a @ecovet.ph address.');
            return;
        }

        if (accounts.some(a => a.email === email && a.id !== editingAccountId)) {
            showToast('That email is already registered to another account.');
            return;
        }

        if (!keepingExistingPassword) {
            if (!isPasswordStrong(password)) {
                showToast('Password doesn\'t meet all the requirements yet.');
                return;
            }

            if (password !== confirmPassword) {
                showToast('Password and confirm password don\'t match.');
                return;
            }
        }

        const accountData = {
            name: staffFullNameField.value.trim(),
            address: staffAddressField.value.trim(),
            email,
            mobile: staffMobileField.value.trim(),
            branch: staffLocationField.value,
            position: staffPositionField.value,
            photo: currentPhotoDataUrl
        };

        if (!keepingExistingPassword) {
            accountData.password = password;
        }

        if (isEditing) {
            const existing = accounts.find(a => a.id === editingAccountId);
            Object.assign(existing, accountData);
            saveAccounts();
            closeAccountModal();
            renderAccounts();
            showToast(`"${accountData.name}"'s account was updated.`);
        } else {
            const account = {
                id: nextAccountId++,
                role: 'Staff',
                lastLogin: 'Never',
                ...accountData
            };
            accounts.push(account);
            saveAccounts();
            closeAccountModal();
            renderAccounts();
            showToast(`"${account.name}" was added as staff.`);
        }
    });
}

// ==================== TABLE ROW INTERACTIONS ====================

if (accountTableBody) {
    accountTableBody.addEventListener('click', function (e) {
        const deleteBtn = e.target.closest('.account-row-action-btn.delete');
        if (deleteBtn) {
            const account = accounts.find(a => a.id === Number(deleteBtn.dataset.id));
            if (account && confirm(`Remove "${account.name}"'s account?`)) {
                accounts = accounts.filter(a => a.id !== account.id);
                saveAccounts();
                renderAccounts();
                showToast(`"${account.name}" was removed.`);
            }
            return;
        }

        const editBtn = e.target.closest('.account-row-action-btn.edit');
        const row = e.target.closest('.account-row');
        const target = editBtn || row;
        if (target) {
            const account = accounts.find(a => a.id === Number(target.dataset.id));
            if (account) openEditAccountModal(account);
        }
    });
}

// ==================== SEARCH ====================

if (accountSearch) {
    accountSearch.addEventListener('input', function () {
        searchTerm = this.value.trim().toLowerCase();
        renderAccounts();
    });
}

// ==================== SORT (not wired up yet) ====================

sortableCols.forEach(col => {
    col.addEventListener('click', () => showToast(`Sorting by ${col.textContent.trim()} isn't connected yet.`));
});

// ==================== ESCAPE CLOSES MODAL ====================

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAccountModal();
});

// ==================== INIT ====================

renderAccounts();

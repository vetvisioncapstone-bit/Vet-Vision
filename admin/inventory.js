// ==================== STATE ====================
// Persisted to localStorage (there's no backend yet) so the product catalog
// survives reloads and can be read by other pages - the Patients page's
// "availed products" dropdown pulls from this same key.

const INVENTORY_STORAGE_KEY = 'vvInventoryProducts';

function loadProducts() {
    try {
        const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveProducts() {
    try {
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(products));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let products = loadProducts();
let nextProductId = products.reduce((max, p) => Math.max(max, p.id + 1), 1);
let editingProductId = null;
let currentPhotoDataUrl = null;
let searchTerm = '';
let activeCategories = new Set();

// ==================== DOM REFS ====================

const productTableBody = document.getElementById('productTableBody');
const statTotalSkus = document.getElementById('statTotalSkus');
const inventorySearch = document.getElementById('inventorySearch');

const productModalOverlay = document.getElementById('productModalOverlay');
const productModalTitle = document.getElementById('productModalTitle');
const productForm = document.getElementById('productForm');
const productIdField = document.getElementById('productId');
const productNameField = document.getElementById('productName');
const productCategoryField = document.getElementById('productCategory');
const productBranchField = document.getElementById('productBranch');
const productQuantityField = document.getElementById('productQuantity');
const productReorderPointField = document.getElementById('productReorderPoint');
const productDeliveryField = document.getElementById('productDelivery');
const productExpirationField = document.getElementById('productExpiration');
const productSubmitBtn = document.getElementById('productSubmitBtn');
const productModalClose = document.getElementById('productModalClose');
const newProductBtn = document.getElementById('newProductBtn');

const photoUploadLabel = document.getElementById('photoUploadLabel');
const productPhotoInput = document.getElementById('productPhotoInput');
const photoPreview = document.getElementById('photoPreview');
const photoUploadPlaceholder = document.getElementById('photoUploadPlaceholder');

const detailModalOverlay = document.getElementById('detailModalOverlay');
const detailModalClose = document.getElementById('detailModalClose');
const detailPhoto = document.getElementById('detailPhoto');
const detailName = document.getElementById('detailName');
const detailCategory = document.getElementById('detailCategory');
const detailQuantity = document.getElementById('detailQuantity');
const detailReorderPoint = document.getElementById('detailReorderPoint');
const detailDelivery = document.getElementById('detailDelivery');
const detailExpiration = document.getElementById('detailExpiration');
const detailStatus = document.getElementById('detailStatus');

const filterBtn = document.getElementById('filterBtn');
const filterPopover = document.getElementById('filterPopover');
const filterCategoryList = document.getElementById('filterCategoryList');

// ==================== HELPERS ====================

function formatDate(isoString) {
    if (!isoString) return '—';
    const [year, month, day] = isoString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatus(product) {
    if (product.quantity <= 0) return { label: 'Out of stock', cls: 'status-out-of-stock' };
    if (product.quantity <= product.reorderPoint) return { label: 'Low Stock', cls: 'status-low-stock' };
    return { label: 'Ok', cls: 'status-ok' };
}

function placeholderThumbSvg() {
    return `<div class="product-thumb-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
    </div>`;
}

// ==================== RENDER ====================

function getVisibleProducts() {
    return products
        .filter(p => {
            const matchesSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm) || p.category.toLowerCase().includes(searchTerm);
            const matchesCategory = activeCategories.size === 0 || activeCategories.has(p.category);
            return matchesSearch && matchesCategory;
        })
        .sort((a, b) => a.expiration.localeCompare(b.expiration)); // FIFO: soonest to expire first
}

function renderProducts() {
    const visible = getVisibleProducts();

    if (products.length === 0) {
        productTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No products yet. Click "+ New" to add one.</td></tr>';
    } else if (visible.length === 0) {
        productTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No products match your search or filter.</td></tr>';
    } else {
        productTableBody.innerHTML = visible.map(p => {
            const status = getStatus(p);
            return `
            <tr class="product-row" data-id="${p.id}">
                <td>${p.photo ? `<img class="product-thumb" src="${p.photo}" alt="${p.name}">` : placeholderThumbSvg()}</td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>${p.branch || '—'}</td>
                <td>${p.quantity}</td>
                <td><span class="status-pill ${status.cls}">${status.label}</span></td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="row-action-btn edit" data-id="${p.id}" aria-label="Edit product">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button type="button" class="row-action-btn delete" data-id="${p.id}" aria-label="Delete product">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    }

    statTotalSkus.textContent = products.length;
}

function renderCategoryFilter() {
    const categories = [...new Set(products.map(p => p.category))].sort();

    if (categories.length === 0) {
        filterCategoryList.innerHTML = '<p class="empty-state">No categories yet.</p>';
        return;
    }

    filterCategoryList.innerHTML = categories.map(cat => `
        <label class="filter-option">
            <input type="checkbox" value="${cat}" ${activeCategories.has(cat) ? 'checked' : ''}>
            <span>${cat}</span>
        </label>
    `).join('');

    filterCategoryList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked) {
                activeCategories.add(this.value);
            } else {
                activeCategories.delete(this.value);
            }
            renderProducts();
        });
    });
}

// ==================== PRODUCT MODAL ====================

function resetPhotoField() {
    currentPhotoDataUrl = null;
    productPhotoInput.value = '';
    photoPreview.hidden = true;
    photoPreview.src = '';
    photoUploadPlaceholder.hidden = false;
}

function openAddModal() {
    editingProductId = null;
    productForm.reset();
    productIdField.value = '';
    resetPhotoField();
    productModalTitle.textContent = 'Add new product';
    productSubmitBtn.textContent = 'Add product';
    productModalOverlay.classList.add('show');
    productNameField.focus();
}

function openEditModal(product) {
    editingProductId = product.id;
    productIdField.value = product.id;
    productNameField.value = product.name;
    productCategoryField.value = product.category;
    productBranchField.value = product.branch || '';
    productQuantityField.value = product.quantity;
    productReorderPointField.value = product.reorderPoint;
    productDeliveryField.value = product.delivery;
    productExpirationField.value = product.expiration;

    if (product.photo) {
        currentPhotoDataUrl = product.photo;
        photoPreview.src = product.photo;
        photoPreview.hidden = false;
        photoUploadPlaceholder.hidden = true;
    } else {
        resetPhotoField();
    }

    productModalTitle.textContent = 'Edit product';
    productSubmitBtn.textContent = 'Save changes';
    productModalOverlay.classList.add('show');
}

function closeProductModal() {
    productModalOverlay.classList.remove('show');
}

if (newProductBtn) {
    newProductBtn.addEventListener('click', openAddModal);
}

if (productModalClose) {
    productModalClose.addEventListener('click', closeProductModal);
}

if (productModalOverlay) {
    productModalOverlay.addEventListener('click', e => {
        if (e.target === productModalOverlay) closeProductModal();
    });
}

if (photoUploadLabel) {
    productPhotoInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            currentPhotoDataUrl = e.target.result;
            photoPreview.src = currentPhotoDataUrl;
            photoPreview.hidden = false;
            photoUploadPlaceholder.hidden = true;
        };
        reader.readAsDataURL(file);
    });
}

if (productForm) {
    productForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const productData = {
            name: productNameField.value.trim(),
            category: productCategoryField.value.trim(),
            branch: productBranchField.value,
            quantity: Number(productQuantityField.value),
            reorderPoint: Number(productReorderPointField.value),
            delivery: productDeliveryField.value,
            expiration: productExpirationField.value,
            photo: currentPhotoDataUrl
        };

        if (editingProductId) {
            const existing = products.find(p => p.id === editingProductId);
            Object.assign(existing, productData);
            showToast(`"${productData.name}" was updated.`);
        } else {
            products.push({ id: nextProductId++, ...productData });
            showToast(`"${productData.name}" was added to inventory.`);
        }

        saveProducts();
        closeProductModal();
        renderProducts();
        renderCategoryFilter();
    });
}

// ==================== DETAIL MODAL ====================

function openDetailModal(product) {
    detailPhoto.src = product.photo || '';
    detailPhoto.alt = product.name;
    detailPhoto.style.display = product.photo ? 'block' : 'none';
    detailName.textContent = product.name;
    detailCategory.textContent = product.category;
    detailQuantity.textContent = product.quantity;
    detailReorderPoint.textContent = product.reorderPoint;
    detailDelivery.textContent = formatDate(product.delivery);
    detailExpiration.textContent = formatDate(product.expiration);

    const status = getStatus(product);
    detailStatus.textContent = status.label;
    detailStatus.className = `status-pill ${status.cls}`;

    detailModalOverlay.classList.add('show');
}

function closeDetailModal() {
    detailModalOverlay.classList.remove('show');
}

if (detailModalClose) {
    detailModalClose.addEventListener('click', closeDetailModal);
}

if (detailModalOverlay) {
    detailModalOverlay.addEventListener('click', e => {
        if (e.target === detailModalOverlay) closeDetailModal();
    });
}

// ==================== TABLE ROW INTERACTIONS ====================

if (productTableBody) {
    productTableBody.addEventListener('click', function (e) {
        const editBtn = e.target.closest('.row-action-btn.edit');
        const deleteBtn = e.target.closest('.row-action-btn.delete');
        const row = e.target.closest('.product-row');

        if (editBtn) {
            const product = products.find(p => p.id === Number(editBtn.dataset.id));
            if (product) openEditModal(product);
            return;
        }

        if (deleteBtn) {
            const product = products.find(p => p.id === Number(deleteBtn.dataset.id));
            if (product && confirm(`Delete "${product.name}" from inventory?`)) {
                products = products.filter(p => p.id !== product.id);
                saveProducts();
                renderProducts();
                renderCategoryFilter();
                showToast(`"${product.name}" was deleted.`);
            }
            return;
        }

        if (row) {
            const product = products.find(p => p.id === Number(row.dataset.id));
            if (product) openDetailModal(product);
        }
    });
}

// ==================== SEARCH ====================

if (inventorySearch) {
    inventorySearch.addEventListener('input', function () {
        searchTerm = this.value.trim().toLowerCase();
        renderProducts();
    });
}

// ==================== CATEGORY FILTER POPOVER ====================

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

// ==================== ESCAPE CLOSES MODALS ====================

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeProductModal();
        closeDetailModal();
        if (filterPopover) filterPopover.classList.remove('show');
    }
});

// ==================== INIT ====================

renderProducts();
renderCategoryFilter();

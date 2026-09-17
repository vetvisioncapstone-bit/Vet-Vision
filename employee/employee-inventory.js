// ==================== STATE ====================
// Reads/writes the exact same localStorage key the admin Inventory page
// uses, so a product added here shows up there and vice versa. Scoped to
// this employee's own branch - they never see other branches' stock.

const INVENTORY_STORAGE_KEY = 'vvInventoryProducts';

function loadAllProducts() {
    try {
        const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveAllProducts(all) {
    try {
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(all));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let allProducts = loadAllProducts();
let nextProductId = allProducts.reduce((max, p) => Math.max(max, p.id + 1), 1);
let editingProductId = null;
let currentPhotoDataUrl = null;
let searchTerm = '';

// ==================== DOM REFS ====================

const productTableBody = document.getElementById('productTableBody');
const statTotalItems = document.getElementById('statTotalItems');
const statLowStock = document.getElementById('statLowStock');
const statOutOfStock = document.getElementById('statOutOfStock');
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

// ==================== HELPERS ====================

function formatDate(isoString) {
    if (!isoString) return '—';
    const [year, month, day] = isoString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatus(product) {
    if (product.quantity <= 0) return { label: 'Out of stock', cls: 'status-out-of-stock' };
    if (product.quantity <= product.reorderPoint) return { label: 'Low stock', cls: 'status-low-stock' };
    return { label: 'Ok', cls: 'status-ok' };
}

// There's no real sales-velocity tracking in this prototype yet (Sales
// analytics / Forecasting are still stubs) - this is a simple stand-in
// heuristic based on how close a product is to its reorder point, not an
// actual measured turnover rate.
function getMovementLabel(product) {
    return product.quantity <= product.reorderPoint * 2 ? 'Fast' : 'Slow';
}

function getBranchProducts() {
    const branch = getEmployeeBranch();
    return allProducts.filter(p => p.branch === branch);
}

function getVisibleProducts() {
    return getBranchProducts().filter(p =>
        !searchTerm || p.name.toLowerCase().includes(searchTerm) || p.category.toLowerCase().includes(searchTerm)
    );
}

// ==================== RENDER ====================

function renderStats() {
    const branchProducts = getBranchProducts();
    statTotalItems.textContent = branchProducts.length;
    statLowStock.textContent = branchProducts.filter(p => getStatus(p).label === 'Low stock').length;
    statOutOfStock.textContent = branchProducts.filter(p => getStatus(p).label === 'Out of stock').length;
}

function renderProducts() {
    const visible = getVisibleProducts();
    const branchProducts = getBranchProducts();

    if (branchProducts.length === 0) {
        productTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No products for this branch yet. Click "+ New" to add one.</td></tr>';
    } else if (visible.length === 0) {
        productTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No products match your search.</td></tr>';
    } else {
        productTableBody.innerHTML = visible.map(p => {
            const status = getStatus(p);
            const movement = getMovementLabel(p);
            return `
            <tr data-id="${p.id}">
                <td>${p.name}</td>
                <td>${p.quantity} pcs</td>
                <td>${p.reorderPoint}pcs</td>
                <td><span class="movement-pill movement-${movement.toLowerCase()}">${movement}</span></td>
                <td><span class="status-pill ${status.cls}">${status.label}</span></td>
                <td>
                    <div class="employee-row-actions">
                        <button type="button" class="restock-btn" data-restock="${p.id}">Request Stock</button>
                        <button type="button" class="row-action-btn edit" data-edit="${p.id}" aria-label="Edit product">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button type="button" class="row-action-btn delete" data-delete="${p.id}" aria-label="Request deletion">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    }

    renderStats();
}

// ==================== ADD / EDIT MODAL ====================

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
    productBranchField.value = getEmployeeBranch();
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
    productBranchField.value = product.branch;
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

if (productPhotoInput) {
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
            branch: getEmployeeBranch(),
            quantity: Number(productQuantityField.value),
            reorderPoint: Number(productReorderPointField.value),
            delivery: productDeliveryField.value,
            expiration: productExpirationField.value,
            photo: currentPhotoDataUrl
        };

        if (editingProductId) {
            const existing = allProducts.find(p => p.id === editingProductId);
            Object.assign(existing, productData);
            showToast(`"${productData.name}" was updated.`);
        } else {
            allProducts.push({ id: nextProductId++, ...productData });
            showToast(`"${productData.name}" was added.`);
        }

        saveAllProducts(allProducts);
        closeProductModal();
        renderProducts();
    });
}

// ==================== ROW INTERACTIONS ====================

if (productTableBody) {
    productTableBody.addEventListener('click', function (e) {
        const editBtn = e.target.closest('[data-edit]');
        const deleteBtn = e.target.closest('[data-delete]');
        const restockBtn = e.target.closest('[data-restock]');

        if (editBtn) {
            const product = allProducts.find(p => p.id === Number(editBtn.dataset.edit));
            if (product) openEditModal(product);
            return;
        }

        if (deleteBtn) {
            const product = allProducts.find(p => p.id === Number(deleteBtn.dataset.delete));
            if (product && confirm(`Send a request to the admin to delete "${product.name}"?`)) {
                requestDelete('inventory-product', product.id, product.name, { branch: product.branch });
                showToast(`Delete request for "${product.name}" sent to the admin.`);
            }
            return;
        }

        if (restockBtn) {
            const product = allProducts.find(p => p.id === Number(restockBtn.dataset.restock));
            if (product) {
                requestRestock(product.id, product.name, product.branch);
                showToast(`Restock request for "${product.name}" sent to the admin.`);
            }
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

// A delete approved elsewhere (or a product added/edited in another tab)
// changes this same localStorage key - pick that up without a full reload.
window.addEventListener('storage', e => {
    if (e.key === INVENTORY_STORAGE_KEY) {
        allProducts = loadAllProducts();
        renderProducts();
    }
});

// ==================== ESCAPE CLOSES MODAL ====================

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProductModal();
});

// ==================== INIT ====================

renderProducts();

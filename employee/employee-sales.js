// ==================== STATE ====================
// Reads/writes the same 'vvInventoryProducts' key the Inventory pages use,
// so completing a sale here deducts stock everyone else sees. Completed
// sales are appended to a new 'vvSales' key (branch-scoped), which the
// employee dashboard's chart reads from.

const INVENTORY_STORAGE_KEY = 'vvInventoryProducts';
const SALES_STORAGE_KEY = 'vvSales';

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

function loadSales() {
    try {
        const raw = localStorage.getItem(SALES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveSales() {
    try {
        localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
    } catch {
        showToast('Could not save to local storage (storage may be full).');
    }
}

let allProducts = loadAllProducts();
let sales = loadSales();
let nextSaleId = sales.reduce((max, s) => Math.max(max, s.id + 1), 1);
let cartItems = [];

// ==================== DOM REFS ====================

const saleProductField = document.getElementById('saleProduct');
const saleQuantityField = document.getElementById('saleQuantity');
const salePriceField = document.getElementById('salePrice');
const saleAddBtn = document.getElementById('saleAddBtn');
const saleStockHint = document.getElementById('saleStockHint');
const cartTableBody = document.getElementById('cartTableBody');
const cartTotal = document.getElementById('cartTotal');
const completeSaleBtn = document.getElementById('completeSaleBtn');
const recentSalesList = document.getElementById('recentSalesList');

// ==================== HELPERS ====================

function formatPrice(amount) {
    return `₱${Number(amount || 0).toFixed(2)}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getBranchProducts() {
    const branch = getEmployeeBranch();
    return allProducts.filter(p => p.branch === branch);
}

function getBranchSales() {
    const branch = getEmployeeBranch();
    return sales
        .filter(s => s.branch === branch)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getCartQuantity(productId) {
    const line = cartItems.find(i => i.productId === productId);
    return line ? line.quantity : 0;
}

function getAvailableStock(product) {
    return product.quantity - getCartQuantity(product.id);
}

// ==================== PRODUCT PICKER ====================

function populateProductOptions() {
    const branchProducts = getBranchProducts().filter(p => p.quantity > 0);
    const selectedValue = saleProductField.value;

    if (branchProducts.length === 0) {
        saleProductField.innerHTML = '<option value="" disabled selected hidden>No products in stock</option>';
        saleProductField.disabled = true;
        saleAddBtn.disabled = true;
        saleStockHint.textContent = '';
        return;
    }

    saleProductField.disabled = false;
    saleAddBtn.disabled = false;
    saleProductField.innerHTML = '<option value="" disabled selected hidden>Select a product</option>'
        + branchProducts.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.quantity} in stock)</option>`).join('');

    if (selectedValue && branchProducts.some(p => String(p.id) === selectedValue)) {
        saleProductField.value = selectedValue;
    }

    updateStockHint();
}

function updateStockHint() {
    const productId = Number(saleProductField.value);
    const product = getBranchProducts().find(p => p.id === productId);

    if (!product) {
        saleStockHint.textContent = '';
        saleStockHint.classList.remove('is-warning');
        return;
    }

    const available = getAvailableStock(product);
    saleQuantityField.max = available;

    if (available <= 0) {
        saleStockHint.textContent = `No more "${product.name}" left to sell.`;
        saleStockHint.classList.add('is-warning');
    } else {
        saleStockHint.textContent = `${available} unit${available === 1 ? '' : 's'} available.`;
        saleStockHint.classList.remove('is-warning');
    }
}

if (saleProductField) {
    saleProductField.addEventListener('change', updateStockHint);
}

// ==================== CART ====================

function renderCart() {
    if (cartItems.length === 0) {
        cartTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No items added yet.</td></tr>';
    } else {
        cartTableBody.innerHTML = cartItems.map((item, index) => `
            <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${item.quantity}</td>
                <td>${formatPrice(item.price)}</td>
                <td>${formatPrice(item.price * item.quantity)}</td>
                <td>
                    <button type="button" class="cart-remove-btn" data-index="${index}" aria-label="Remove ${escapeHtml(item.name)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartTotal.textContent = formatPrice(total);
    completeSaleBtn.disabled = cartItems.length === 0;
}

if (saleAddBtn) {
    saleAddBtn.addEventListener('click', function () {
        const productId = Number(saleProductField.value);
        const product = getBranchProducts().find(p => p.id === productId);
        const quantity = Number(saleQuantityField.value);
        const price = Number(salePriceField.value);

        if (!product) {
            showToast('Pick a product first.');
            return;
        }
        if (!quantity || quantity < 1) {
            showToast('Enter a quantity of at least 1.');
            return;
        }
        if (salePriceField.value === '' || price < 0) {
            showToast('Enter a unit price.');
            return;
        }

        const available = getAvailableStock(product);
        if (quantity > available) {
            showToast(`Only ${available} unit${available === 1 ? '' : 's'} of "${product.name}" left.`);
            return;
        }

        const existingLine = cartItems.find(i => i.productId === productId);
        if (existingLine) {
            existingLine.quantity += quantity;
            existingLine.price = price;
        } else {
            cartItems.push({ productId, name: product.name, quantity, price });
        }

        saleQuantityField.value = 1;
        salePriceField.value = '';
        renderCart();
        populateProductOptions();
    });
}

if (cartTableBody) {
    cartTableBody.addEventListener('click', function (e) {
        const removeBtn = e.target.closest('.cart-remove-btn');
        if (!removeBtn) return;

        cartItems.splice(Number(removeBtn.dataset.index), 1);
        renderCart();
        populateProductOptions();
    });
}

// ==================== RECENT SALES ====================

function renderRecentSales() {
    const branchSales = getBranchSales().slice(0, 8);

    if (branchSales.length === 0) {
        recentSalesList.innerHTML = '<li class="empty-state">No sales recorded yet.</li>';
        return;
    }

    recentSalesList.innerHTML = branchSales.map(sale => `
        <li class="recent-sale-item">
            <div class="recent-sale-top">
                <span>${escapeHtml(sale.staffName)}</span>
                <span class="recent-sale-total">${formatPrice(sale.total)}</span>
            </div>
            <p class="recent-sale-items">${escapeHtml(sale.items.map(i => `${i.name} x${i.quantity}`).join(', '))}</p>
            <p class="recent-sale-time">${new Date(sale.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
        </li>
    `).join('');
}

// ==================== COMPLETE SALE ====================

if (completeSaleBtn) {
    completeSaleBtn.addEventListener('click', function () {
        if (cartItems.length === 0) return;

        for (const item of cartItems) {
            const product = allProducts.find(p => p.id === item.productId);
            if (!product || product.quantity < item.quantity) {
                showToast(`Not enough stock left for "${item.name}". Sale cancelled.`);
                populateProductOptions();
                return;
            }
        }

        cartItems.forEach(item => {
            const product = allProducts.find(p => p.id === item.productId);
            product.quantity -= item.quantity;
        });
        saveAllProducts(allProducts);

        const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const session = getSession();
        sales.push({
            id: nextSaleId++,
            branch: getEmployeeBranch(),
            staffId: session ? session.id : null,
            staffName: getEmployeeName(),
            items: cartItems.slice(),
            total,
            createdAt: new Date().toISOString()
        });
        saveSales();

        showToast(`Sale completed — ${formatPrice(total)}.`);
        cartItems = [];
        renderCart();
        populateProductOptions();
        renderRecentSales();
    });
}

// A product/sale changed in another tab (or by the admin) - keep this
// page's picker, stock hints and recent-sales list in sync.
window.addEventListener('storage', e => {
    if (e.key === INVENTORY_STORAGE_KEY) {
        allProducts = loadAllProducts();
        populateProductOptions();
    }
    if (e.key === SALES_STORAGE_KEY) {
        sales = loadSales();
        renderRecentSales();
    }
});

// ==================== INIT ====================

populateProductOptions();
renderCart();
renderRecentSales();

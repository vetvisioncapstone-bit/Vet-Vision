// ==================== DASHBOARD STATS ====================
// Read-only summary computed from the same localStorage keys the other
// pages (and the admin portal) read/write - nothing owned by this page.

function getStoredPatients() {
    try {
        const raw = localStorage.getItem('vvPatients');
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function getStoredProducts() {
    try {
        const raw = localStorage.getItem('vvInventoryProducts');
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function getStoredSales() {
    try {
        const raw = localStorage.getItem('vvSales');
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function formatPrice(amount) {
    return `₱${Number(amount || 0).toFixed(2)}`;
}

// ==================== SALES CHART ====================
// Last 7 days of completed sales for this branch, from the Sales page.

function toIsoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderSalesChart() {
    const chartEl = document.getElementById('salesChart');
    const totalEl = document.getElementById('weekSalesTotal');
    if (!chartEl) return;

    const branch = getEmployeeBranch();
    const branchSales = getStoredSales().filter(s => s.branch === branch);

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push({ iso: toIsoDate(date), label: date.toLocaleDateString('en-US', { weekday: 'short' }) });
    }

    const totalsByDay = days.map(day =>
        branchSales
            .filter(s => (s.createdAt || '').slice(0, 10) === day.iso)
            .reduce((sum, s) => sum + Number(s.total || 0), 0)
    );

    const weekTotal = totalsByDay.reduce((sum, t) => sum + t, 0);
    if (totalEl) totalEl.textContent = formatPrice(weekTotal);

    // Measure the real box so the viewBox matches actual pixels 1:1 - keeps
    // dots and text from getting stretched by a non-uniform scale.
    const width = Math.max(Math.round(chartEl.getBoundingClientRect().width), 280);
    const height = 220;
    const padLeft = 8;
    const padRight = 8;
    const padTop = 28;
    const padBottom = 26;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const maxTotal = Math.max(...totalsByDay, 1);
    const stepX = days.length > 1 ? plotWidth / (days.length - 1) : 0;

    const points = totalsByDay.map((amount, i) => ({
        x: padLeft + stepX * i,
        y: padTop + plotHeight - (amount / maxTotal) * plotHeight,
        amount
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const baselineY = padTop + plotHeight;
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

    // Label sparingly - just today (the end of the line) and the week's
    // peak day - rather than a number crowding every single point.
    const lastIndex = points.length - 1;
    const peakIndex = totalsByDay.reduce((best, amount, i) => amount > totalsByDay[best] ? i : best, 0);

    const marks = points.map((p, i) => {
        const showValue = totalsByDay[i] > 0 && (i === lastIndex || i === peakIndex);
        const anchor = i === lastIndex ? 'end' : 'middle';
        const labelX = i === lastIndex ? Math.min(p.x, width - padRight) : p.x;
        return `
            ${showValue ? `<text class="line-chart-value" x="${labelX}" y="${p.y - 12}" text-anchor="${anchor}">${formatPrice(p.amount)}</text>` : ''}
            <circle class="line-chart-dot${p.amount === 0 ? ' is-empty' : ''}" cx="${p.x}" cy="${p.y}" r="4"></circle>
        `;
    }).join('');

    const dayLabels = points.map((p, i) => `<text class="line-chart-day-label" x="${p.x}" y="${height - 6}" text-anchor="middle">${days[i].label}</text>`).join('');

    chartEl.innerHTML = `
        <svg class="line-chart-svg" viewBox="0 0 ${width} ${height}">
            <line class="line-chart-gridline" x1="${padLeft}" y1="${baselineY}" x2="${width - padRight}" y2="${baselineY}"></line>
            <path class="line-chart-area" d="${areaPath}"></path>
            <path class="line-chart-path" d="${linePath}"></path>
            ${marks}
            ${dayLabels}
        </svg>
    `;
}

window.addEventListener('resize', renderSalesChart);

function renderDashboard() {
    const branch = getEmployeeBranch();
    const greeting = document.getElementById('dashboardGreeting');
    if (greeting) greeting.textContent = `Welcome back, ${getEmployeeName()}.`;

    const branchPatients = getStoredPatients().filter(p => p.branch === branch);
    document.getElementById('statTotalPatients').textContent = branchPatients.length;
    document.getElementById('statFollowUps').textContent = branchPatients.filter(p => p.status === 'Follow-up needed').length;

    const branchProducts = getStoredProducts().filter(p => p.branch === branch);
    document.getElementById('statLowStock').textContent = branchProducts.filter(p => p.quantity > 0 && p.quantity <= p.reorderPoint).length;
    document.getElementById('statOutOfStock').textContent = branchProducts.filter(p => p.quantity <= 0).length;

    renderSalesChart();
}

window.addEventListener('storage', e => {
    if (['vvPatients', 'vvInventoryProducts', 'vvSales'].includes(e.key)) renderDashboard();
});

renderDashboard();

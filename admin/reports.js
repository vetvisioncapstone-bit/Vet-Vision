// ==================== REPORT GENERATION (not wired up yet) ====================

const reportMonthSelect = document.getElementById('reportMonthSelect');
const reportYearSelect = document.getElementById('reportYearSelect');
const generateSalesReportBtn = document.getElementById('generateSalesReportBtn');
const generateInventoryReportBtn = document.getElementById('generateInventoryReportBtn');
const generatePatientReportBtn = document.getElementById('generatePatientReportBtn');
const exportReportsBtn = document.getElementById('exportReportsBtn');

if (reportMonthSelect) {
    reportMonthSelect.addEventListener('change', function () {
        showToast('Month filter isn\'t connected to any data yet.');
    });
}

if (reportYearSelect) {
    reportYearSelect.addEventListener('change', function () {
        showToast('Year filter isn\'t connected to any data yet.');
    });
}

if (generateSalesReportBtn) {
    generateSalesReportBtn.addEventListener('click', () => showToast('Sales report generation isn\'t connected yet.'));
}

if (generateInventoryReportBtn) {
    generateInventoryReportBtn.addEventListener('click', () => showToast('Inventory report generation isn\'t connected yet.'));
}

if (generatePatientReportBtn) {
    generatePatientReportBtn.addEventListener('click', () => showToast('Patient report generation isn\'t connected yet.'));
}

if (exportReportsBtn) {
    exportReportsBtn.addEventListener('click', () => showToast('Export isn\'t connected to any data yet.'));
}

staggerIn('.report-card');

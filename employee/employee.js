// ==================== EMPLOYEE PORTAL SHARED CHROME ====================
// Loaded on every employee-*.html page, after ../admin/dashboard.js (which
// provides getSession(), showToast(), the notifications bell, popovers, and
// sidebar toggle - all identical for both portals). The chat panel it also
// wires up is admin-only; employee pages simply don't include that markup.
// This file only adds the bits specific to being logged in as staff:
// which branch this page is scoped to, and the "My Branch" header/date.

// No login wall in this prototype - if someone opens an employee page
// without going through the login form, fall back to Ibaan so the page
// still works instead of showing a blank/broken branch everywhere.
function getEmployeeBranch() {
    const session = getSession();
    return (session && session.branch) || 'Ibaan';
}

function getEmployeeName() {
    const session = getSession();
    return (session && session.name) || 'Staff';
}

function applyBranchHeading() {
    const branch = getEmployeeBranch();
    document.querySelectorAll('#branchHeading').forEach(el => {
        el.textContent = `My Branch - ${branch}`;
    });
}

function startEmployeeClock() {
    const dateEl = document.getElementById('employeeDate');
    const timeEl = document.getElementById('employeeTime');
    if (!dateEl && !timeEl) return;

    function tick() {
        const now = new Date();
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    tick();
    setInterval(tick, 30000);
}

applyBranchHeading();
startEmployeeClock();

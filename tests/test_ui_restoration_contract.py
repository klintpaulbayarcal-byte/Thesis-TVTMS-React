from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def text(path):
    return (ROOT / path).read_text(encoding='utf-8')


def test_finalized_fonts_and_restoration_styles_are_loaded():
    index = text('index.html')
    main = text('src/main.jsx')
    assert 'Barlow+Condensed' in index and 'Manrope' in index and 'Fraunces' in index
    assert 'restored-dashboard.css' in main
    assert 'restored-landing.css' in main


def test_landing_restores_finalized_visual_structure():
    page = text('src/pages/Landing.jsx')
    for marker in ['legacy-landing', 'hero-title', 'search-card', 'ticker-track', 'process-comparison-grid', 'Violation Types & Penalties', 'Questions, answered plainly.']:
        assert marker in page, f'Landing should restore finalized marker: {marker}'


def test_sidebar_restores_grouped_admin_and_officer_navigation():
    page = text('src/components/Sidebar.jsx')
    for marker in ['MAIN', 'ENFORCEMENT', 'MANAGEMENT', 'ANALYTICS', 'ADMIN TOOLS', 'ACCOUNT', 'nav-section-title', 'nav-item']:
        assert marker in page, f'Sidebar should restore finalized navigation marker: {marker}'


def test_admin_dashboard_restores_operations_and_premium_sections():
    page = text('src/pages/AdminDashboard.jsx')
    for marker in ['Recorded Citations by Area', 'Operations View', 'admin-welcome-banner', 'Executive Summary', 'Action Required', 'bento-grid', 'Top Hotspot Violations']:
        assert marker in page, f'Admin dashboard should restore finalized marker: {marker}'


def test_officer_dashboard_restores_finalized_welcome_and_actions():
    page = text('src/pages/OfficerDashboard.jsx')
    for marker in ['officer-welcome-banner', 'Issue New Ticket', 'Search Violator', 'My Recent Tickets', 'Quick Actions']:
        assert marker in page, f'Officer dashboard should restore finalized marker: {marker}'


def test_shared_components_use_legacy_compatible_dashboard_classes():
    layout = text('src/layouts/AppLayout.jsx')
    table = text('src/components/DataTable.jsx')
    stat = text('src/components/StatCard.jsx')
    assert 'dashboard-layout' in layout and 'main-content' in layout and 'dashboard-content' in layout
    assert 'table-container' in table
    assert 'stat-header' in stat and 'stat-value' in stat and 'stat-footer' in stat


def test_login_restores_finalized_split_panel_design():
    page = text('src/pages/Login.jsx')
    main = text('src/main.jsx')
    for marker in ['login-modern', 'login-shell', 'login-visual-panel', 'Secure System Access', 'login-form-panel', 'System Online', 'route-preview', 'visual-meta']:
        assert marker in page, f'Login should restore finalized marker: {marker}'
    assert 'restored-login.css' in main


def test_public_lookup_restores_finalized_standalone_design():
    page = text('src/pages/PublicTicketLookup.jsx')
    layout = text('src/layouts/PublicLayout.jsx')
    main = text('src/main.jsx')
    for marker in ['public-lookup-page', 'page-header', 'back-to-home', 'public-badge', 'lookup-card', 'search-tabs', 'results-section', 'footer-note']:
        assert marker in page, f'Public lookup should restore finalized marker: {marker}'
    assert "pathname==='/ticket-lookup'" in layout
    assert 'restored-public-lookup.css' in main


def test_password_reset_reuses_finalized_login_visual_language():
    page = text('src/pages/ResetPassword.jsx')
    for marker in ['login-modern', 'login-shell', 'login-visual-panel', 'login-form-panel', 'Secure Account Recovery', 'Back to Sign In']:
        assert marker in page, f'Password reset should use finalized auth marker: {marker}'


def test_issue_ticket_restores_finalized_form_structure():
    page = text('src/pages/IssueTicket.jsx')
    for marker in ['New Violation Ticket', 'Vehicle Information', 'Violation Information', 'REPEAT OFFENDER DETECTED', 'ticket-form-actions', 'Instructions']:
        assert marker in page, f'Issue Ticket should restore finalized marker: {marker}'


def test_violator_lookup_restores_finalized_search_and_summary_sections():
    page = text('src/pages/LicensePlateLookup.jsx')
    for marker in ['lookup-container', 'lookup-section', 'section-title', 'validation-info', 'search-tabs', 'Vehicle Information', 'Violation Summary', 'summary-cards', 'Violation Tickets']:
        assert marker in page, f'Violator lookup should restore finalized marker: {marker}'


def test_secondary_staff_pages_restore_finalized_page_structures():
    profile = text('src/pages/Profile.jsx')
    audit = text('src/pages/AuditLogs.jsx')
    overview = text('src/pages/AdminOverview.jsx')
    settings = text('src/pages/AdminSettings.jsx')
    tickets = text('src/pages/ViewTickets.jsx')
    for marker in ['profile-hero-card', 'Account Management', 'Update Profile', 'Change Password']:
        assert marker in profile
    for marker in ['profile-hero-card', 'System activity monitoring', 'Recent Logs']:
        assert marker in audit
    for marker in ['profile-hero-card', 'Performance Dashboard', 'Real-time system metrics']:
        assert marker in overview
    for marker in ['LGU Information', 'Filing and Payment Deadlines', 'Email Notification Settings', 'About System']:
        assert marker in settings
    for marker in ['filter-section', 'action-buttons', 'All Violation Tickets']:
        assert marker in tickets


def test_remaining_core_pages_restore_finalized_cards_and_workflow_labels():
    users = text('src/pages/ManageUsers.jsx')
    violations = text('src/pages/ManageViolations.jsx')
    payments = text('src/pages/Payments.jsx')
    disputes = text('src/pages/Disputes.jsx')
    notifications = text('src/pages/Notifications.jsx')
    reports = text('src/pages/Reports.jsx')
    analytics = text('src/pages/AnalyticsDashboard.jsx')
    details = text('src/pages/TicketDetails.jsx')
    for marker in ['User Accounts', 'card-header', 'Add New User']:
        assert marker in users
    for marker in ['Violation Types', 'card-header', 'Add New Violation']:
        assert marker in violations
    for marker in ['Record Ticket Payment', 'Payment History']:
        assert marker in payments
    assert 'Dispute Queue' in disputes
    for marker in ['notification-header', 'My Notifications']:
        assert marker in notifications
    for marker in ['Generate Report', 'Report Results', 'Operational Insights', 'LGU Special Reports']:
        assert marker in reports
    for marker in ['analytics-hero', 'Analytics & KPI Dashboard']:
        assert marker in analytics
    for marker in ['ticket-detail-card', 'VEHICLE VIOLATION TICKET', 'Date & Time Information', 'Vehicle Information', 'Violation Information', 'Issued By', 'Penalty Amount', 'Ticket Timeline', 'Payment History', 'Evidence']:
        assert marker in details

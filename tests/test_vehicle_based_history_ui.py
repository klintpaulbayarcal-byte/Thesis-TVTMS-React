from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_vehicle_based_dashboard_labels():
    officer=(ROOT/'src/pages/OfficerDashboard.jsx').read_text()
    admin=(ROOT/'src/pages/AdminDashboard.jsx').read_text()
    for page in (officer,admin):
        assert 'Vehicles with Repeat Citations' in page
        assert 'Repeat Offender Cases' not in page

def test_plate_history_distinguishes_citations_and_violation_items():
    staff=(ROOT/'src/pages/LicensePlateLookup.jsx').read_text()
    public=(ROOT/'src/pages/PublicTicketLookup.jsx').read_text()
    issue=(ROOT/'src/pages/IssueTicket.jsx').read_text()
    assert 'Historical Citations' in staff
    assert 'Individual Violations' in staff
    assert 'Paid Citations' in staff and 'Unpaid Citations' in staff
    assert 'Recorded Violations (Listed Citations)' in public
    assert 'Next Citation for This Plate' in issue
    assert 'multiple violations' in issue
    assert 'Existing citations and all recorded violations for this vehicle plate' in issue

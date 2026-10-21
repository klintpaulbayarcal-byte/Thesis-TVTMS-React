from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_admin_settings_save_only_one_section():
    src = (ROOT / "src/pages/AdminSettings.jsx").read_text()
    assert "const save=async sectionKeys=>" in src
    assert "sectionKeys.map(key=>" in src
    for label in ("Save LGU Information", "Save Deadlines", "Save Email Preferences"):
        assert label in src
    assert "keys.map(key=>" not in src

def test_ticket_pagination_and_csv_scope():
    src = (ROOT / "src/pages/ViewTickets.jsx").read_text()
    assert "pagination.totalPages" in src
    assert "changePage(query.page+1)" in src
    assert "changePage(query.page-1)" in src
    assert "Export Current Page CSV" in src
    assert "disabled={loading||rows.length===0}" in src
    assert "setTimeout(()=>URL.revokeObjectURL(url),10000)" in src

def test_protect_logged_in_admin_account():
    src = (ROOT / "src/pages/ManageUsers.jsx").read_text()
    assert "Number(row.id)===Number(user?.id)" in src
    assert "You cannot delete your own Administrator account." in src
    assert "disabled={Number(row.id)===Number(user?.id)}" in src

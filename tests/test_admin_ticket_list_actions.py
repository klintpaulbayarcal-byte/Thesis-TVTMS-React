from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_admin_list_explicit_management_actions():
    source=(ROOT/'src/pages/ViewTickets.jsx').read_text()
    assert 'key:\'manage\'' in source
    for intent in ['action=edit','action=cancel','action=delete']:
        assert intent in source
    assert 'user?.role===\'apprehending_officer\'&&<Link to="/officer/issue-ticket"' in source
    assert "const admin=user?.role==='admin';" in source
def test_action_links_only_open_secure_detail_dialog():
    source=(ROOT/'src/pages/TicketDetails.jsx').read_text()
    assert "new URLSearchParams(search).get('action')" in source
    assert "['edit','cancel','delete','archive'].includes(intent)" in source
    assert "setActionOpen(true)" in source
    assert "navigate(`/tickets/${id}`,{replace:true})" in source
    assert 'API.permanentDeleteTicket(id, actionReason.trim(), deleteConfirmation)' in source

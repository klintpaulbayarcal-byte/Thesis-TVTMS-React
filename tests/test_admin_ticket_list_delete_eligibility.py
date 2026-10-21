from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_admin_delete_list_requires_server_verification():
    php=(ROOT/'api/src/handlers/tickets.php').read_text()
    ui=(ROOT/'src/pages/ViewTickets.jsx').read_text()
    handler=php.split('function ticket_enrich_delete_eligibility(',1)[1].split('function tickets_list(',1)[0]
    for table in ['payments','disputes','evidence','public_dispute_verifications','ticket_email_notifications']:
        assert table in handler
    assert "if($tickets)" in handler
    assert "if($u['role']==='admin')$tickets=ticket_enrich_delete_eligibility($tickets);" in php
    assert "if($u['role']==='admin')$ticket=ticket_enrich_delete_eligibility([$ticket])[0];" in php
    assert "$verified=false;" in handler
    assert "$item['delete_eligible']=$reason===null;" in handler
    assert "row.delete_eligible===true" in ui
    assert "row.delete_eligible!==true" in ui
    assert "row.delete_block_reason" in ui
    assert "to={`${details}?action=delete`}" in ui
    assert "user?.role==='apprehending_officer'&&<Link to=\"/officer/issue-ticket\"" in ui

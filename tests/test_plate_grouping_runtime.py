import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_plate_grouping_runtime():
    r=subprocess.run(['node','--test','tests/plate-grouping-runtime.mjs'],cwd=ROOT,text=True,capture_output=True,timeout=20)
    assert r.returncode==0,r.stdout+'\n'+r.stderr

def test_grouped_ui_preserves_distinct_citation_actions():
    staff=(ROOT/'src/pages/LicensePlateLookup.jsx').read_text()
    public=(ROOT/'src/pages/PublicTicketLookup.jsx').read_text()
    manage=(ROOT/'src/pages/ViewTickets.jsx').read_text()
    issue=(ROOT/'src/pages/IssueTicket.jsx').read_text()
    for ui in (staff,public,manage,issue):
        assert 'PlateCitationGroup' in ui
    assert 'actionCell(row)' in manage
    assert 'Export Current Page CSV' in manage
    assert "mode==='ticket'&&tickets.map(ticket=>" in public
    assert 'publicDisputeSection' in public
    assert 'Existing citations and all recorded violations for this vehicle plate' in issue

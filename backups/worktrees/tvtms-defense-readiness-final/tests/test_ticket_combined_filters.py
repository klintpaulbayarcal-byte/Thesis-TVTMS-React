"""A status filter and a text query must reach the same backend list request."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_combined_ticket_search_and_status_use_backend_combined_filters():
    view=(ROOT/'src/pages/ViewTickets.jsx').read_text(encoding='utf-8')
    handler=(ROOT/'api/src/handlers/tickets.php').read_text(encoding='utf-8')
    assert 'const response=await API.tickets(nextFilters)' in view
    assert 'API.searchTickets(nextFilters.search)' not in view
    assert "'search'=>$_GET['search']??null" in handler
    assert "'status'=>$status!==''?($map[$status]??$status):null" in handler

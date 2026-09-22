"""Reset must request the cleared filters, not a closure capturing the old render."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_reset_loads_the_explicitly_cleared_filters():
    source = (ROOT / 'src/pages/ViewTickets.jsx').read_text(encoding='utf-8')
    assert 'const load=async(nextFilters=filters)' in source
    assert 'nextFilters.search?await API.searchTickets(nextFilters.search):await API.tickets(nextFilters)' in source
    assert 'setTimeout(load,0)' not in source
    assert 'load(clearedFilters)' in source

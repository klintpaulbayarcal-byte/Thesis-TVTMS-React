"""Reset must request the cleared filters, not a closure capturing the old render."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_reset_loads_the_explicitly_cleared_filters():
    source = (ROOT / 'src/pages/ViewTickets.jsx').read_text(encoding='utf-8')
    assert "setFilters({search:'',status:''})" in source
    assert "setQuery({search:'',status:'',page:1,pageSize:50})" in source
    assert 'setTimeout(load,0)' not in source

"""Avoid false zero statistics while dashboard data is pending or partially failed."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(name):
    return (ROOT / 'src/pages' / name).read_text(encoding='utf-8')


def test_admin_shows_loading_and_independent_request_failures():
    s=source('AdminDashboard.jsx')
    assert 'const [loading,setLoading]=useState(true)' in s
    assert 'Loading dashboard statistics' in s
    assert "results.filter(result=>result.status==='rejected')" in s
    assert 'setLoading(false)' in s


def test_officer_shows_loading_and_preserves_successful_sibling():
    s=source('OfficerDashboard.jsx')
    assert 'const [loading,setLoading]=useState(true)' in s
    assert 'Promise.allSettled' in s
    assert 'Loading dashboard statistics' in s
    assert "result.status==='rejected'" in s
    assert 'setLoading(false)' in s


def test_analytics_distinguishes_initial_loading_from_refresh_and_failure():
    s=source('AnalyticsDashboard.jsx')
    assert 'const [loaded,setLoaded]=useState(false)' in s
    assert 'Loading analytics' in s
    assert 'setLoaded(true)' in s
    assert 'Refreshing…' in s
    assert 'setData({collections:c.data' in s

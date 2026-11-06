"""Landing Ticket Lookup fragment offset must account for sticky nav on mobile/desktop."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_search_card_fragment_matches_existing_sticky_nav_offsets():
    css=(ROOT/'src/styles/landing-anchor-offset.css').read_text(encoding='utf-8')
    landing=(ROOT/'src/pages/Landing.jsx').read_text(encoding='utf-8')
    assert 'id="search-card"' in landing
    assert 'href="#search-card"' in landing
    assert '.legacy-landing #search-card' in css
    assert 'scroll-margin-top: 96px;' in css
    assert 'scroll-margin-top: 86px;' in css

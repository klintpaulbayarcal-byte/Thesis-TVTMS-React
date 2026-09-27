"""Regression guard for sticky-navigation fragment targets on the public portal."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_faq_and_contact_anchor_targets_clear_sticky_navigation():
    css = (ROOT / 'src/styles/landing-anchor-offset.css').read_text(encoding='utf-8')
    assert '.legacy-landing #faq' in css
    assert '.legacy-landing #contact' in css
    assert 'scroll-margin-top: 96px;' in css
    assert '@media (max-width: 650px)' in css
    assert 'scroll-margin-top: 86px;' in css
    main = (ROOT / 'src/main.jsx').read_text(encoding='utf-8')
    assert "import './styles/landing-anchor-offset.css';" in main

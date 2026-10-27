"""Guard contact-form text contrast against accidental white-on-white styling."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def test_contact_fields_have_explicit_readable_colors():
    css = (ROOT / 'src/styles/landing-anchor-offset.css').read_text(encoding='utf-8')
    match = re.search(
        r'\.legacy-landing \.landing-contact-form input,\s*'
        r'\.legacy-landing \.landing-contact-form textarea\s*\{([^}]*)\}',
        css,
    )
    assert match, 'Scoped contact-field contrast rules are missing'
    rules = match.group(1)
    assert 'background: #ffffff !important;' in rules
    assert 'color: #0f172a !important;' in rules
    assert 'caret-color: #0f172a;' in rules
    assert 'font-size: 16px !important;' in rules
    assert '.legacy-landing .landing-contact-form textarea::placeholder' in css
    assert 'color: #64748b !important;' in css
    main = (ROOT / 'src/main.jsx').read_text(encoding='utf-8')
    assert "import './styles/landing-anchor-offset.css';" in main

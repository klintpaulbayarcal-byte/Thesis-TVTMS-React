"""Notification readability regression from 2026-09-21 recording at 03:10."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_contact_notification_timestamp_and_action_get_separate_lines():
    style=(ROOT/'src/styles/defense-readiness-polish.css').read_text(encoding='utf-8')
    source=(ROOT/'src/pages/Notifications.jsx').read_text(encoding='utf-8')
    assert '.restored-notifications-page .notification-content > small' in style
    assert 'display:block' in style
    assert '.notification-view-message' in style
    assert 'margin-top:' in style
    assert 'dateTime(row.created_at)' in source
    assert 'onClick={event=>{event.stopPropagation();openContactMessage(row);}}' in source


def test_scoped_styles_are_loaded_last_without_changing_existing_design():
    entry=(ROOT/'src/main.jsx').read_text(encoding='utf-8')
    assert "import './styles/defense-readiness-polish.css';" in entry
    assert entry.index("import './styles/landing-anchor-offset.css';") < entry.index("import './styles/defense-readiness-polish.css';")

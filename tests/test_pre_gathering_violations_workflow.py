from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_violations_editor_blocks_double_save_and_shows_backend_errors():
    ui=(ROOT/'src/pages/ManageViolations.jsx').read_text()
    assert "if(saving)return;" in ui
    assert "disabled={saving}" in ui
    assert "setModalError(error.message" in ui
    assert "modalError&&<div" in ui

def test_official_catalog_mutation_omits_identity_fields():
    ui=(ROOT/'src/pages/ManageViolations.jsx').read_text()
    api=(ROOT/'api/src/handlers/violations.php').read_text()
    assert "const payload=official?{description:" in ui
    assert "demerit_points:points}" in ui
    assert "protect_official_violation_input($cur,$in)" in api
    assert "disabled={row.is_citation_selectable}" in ui
    assert "if(row.is_citation_selectable)return;" in ui

def test_violations_ui_prevents_invalid_input_and_explains_administrative_only():
    ui=(ROOT/'src/pages/ManageViolations.jsx').read_text()
    assert "Number.isInteger(points)" in ui
    assert "administrative reference only" in ui
    assert "The 18 official citation choices are protected" in ui

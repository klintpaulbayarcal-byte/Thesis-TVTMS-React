"""Regression coverage for the approved responsive landing-page hero."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LANDING = ROOT / "src/pages/Landing.jsx"
STYLES = ROOT / "src/styles/restored-landing.css"


def source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_approved_navbar_and_three_line_hero_content_are_present():
    landing = source(LANDING)

    assert 'className="landing-nav approved-landing-nav"' in landing
    assert 'src="/images/calape-logo.webp"' in landing
    assert '<strong>TVTMS</strong><span>Calape, Bohol</span>' in landing
    assert 'A digital platform supporting traffic citation management, public ticket verification, and enforcement record monitoring for Calape, Bohol.' in landing
    assert 'Staff Portal</Link>' in landing
    assert '<span>Calape, Bohol</span>' in landing
    assert 'SAFE ROADS. STRONGER COMMUNITIES.' in landing
    assert '<span>Traffic Violation</span>' in landing
    assert '<span>Ticketing and</span>' in landing
    assert '<span>Management System</span>' in landing
    assert 'Check My Ticket' in landing
    assert 'How It Works' in landing


def test_lookup_is_hidden_by_default_and_both_entry_points_open_it():
    landing = source(LANDING)

    assert "const [lookupOpen,setLookupOpen]=useState(false)" in landing
    assert "const openLookup=" in landing
    assert "setLookupOpen(true)" in landing
    assert "scrollIntoView({behavior:'smooth',block:'start'})" in landing
    assert landing.count("onClick={openLookup}") == 2
    assert "{lookupOpen&&(\n" in landing
    assert 'className="landing-lookup-section" id="search-card"' in landing


def test_existing_lookup_logic_and_results_are_preserved():
    landing = source(LANDING)

    assert "const quickLookup=async" in landing
    assert "API.publicTicketLookup(filters)" in landing
    assert "mode==='plate'" in landing
    assert "mode==='ticket'" in landing
    assert "remaining_balance" in landing
    assert "t.status||'record'" in landing
    assert "View full plate history" in landing


def test_four_approved_feature_cards_are_rendered():
    landing = source(LANDING)

    expected = {
        'Efficient Enforcement': 'Supports organized and systematic traffic management.',
        'Accurate Records': 'Improves data accuracy and record keeping.',
        'Transparent Process': 'Provides accessible and reliable violation information.',
        'Safer Communities': 'Promotes discipline and accountability for safer roads in Calape, Bohol.',
    }
    assert 'className="landing-hero-feature-grid"' in landing
    assert 'className="landing-hero-feature-card"' in landing
    for title, description in expected.items():
        assert title in landing
        assert description in landing


def test_desktop_hero_uses_scalable_scoped_rules_and_authentic_asset():
    styles = source(STYLES)
    approved_styles = styles[styles.index("/* Approved landing-page hero."):]

    assert "url('/images/calape-police-station-clean.png')" in approved_styles
    assert (ROOT / 'public/images/calape-police-station-clean.png').is_file()
    assert approved_styles.count("clamp(") >= 12
    assert ".approved-landing-hero" in approved_styles
    assert ".landing-hero-feature-grid" in approved_styles
    assert ".landing-hero-feature-card" in approved_styles
    assert "--approved-nav-gutter:clamp(" in approved_styles
    assert "--approved-hero-gutter:clamp(" in approved_styles
    assert "padding:0 var(--approved-nav-gutter)" in approved_styles
    assert "padding:0 var(--approved-card-gutter)" in approved_styles
    assert "max-width:none" in approved_styles
    assert "calc((100vw - 900px)/2)" not in approved_styles
    assert "calc((100vw - 924px)/2)" not in approved_styles
    assert "height:470px" not in approved_styles
    assert "font-size:50px!important" not in approved_styles
    assert "max-width:924px" not in approved_styles


def test_protected_lower_landing_sections_remain_present():
    landing = source(LANDING)

    protected_markers = [
        'className="ticker"',
        'className="landing-section overview-section"',
        'Traditional Process vs TVTMS Digital Workflow',
        'id="how-it-works"',
        'className="landing-section roles-section"',
        'id="features"',
        'id="violations"',
        'id="about"',
        'id="faq"',
        'id="contact"',
        'className="landing-footer"',
    ]
    for marker in protected_markers:
        assert marker in landing

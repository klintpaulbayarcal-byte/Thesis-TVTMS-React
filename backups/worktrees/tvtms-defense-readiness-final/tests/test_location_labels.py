"""Locations are labels, not inferred barangay names or statistical risk."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_coordinate_formatter_preserves_data_without_guessing_places():
    js = '''import {displayLocation,isCoordinateLocation} from './src/utils/locationLabel.js';
const cases=[
['9.650001, 123.987654','Coordinates: 9.650001, 123.987654'],
['  Calape, Bohol  ','Calape, Bohol'],['','Unspecified'],
['95, 123','95, 123'],['9.6, -181','9.6, -181'],
['-9.0, -123.456','Coordinates: -9.0, -123.456']];
for(const [raw,expected] of cases){if(displayLocation(raw)!==expected){console.error(raw,displayLocation(raw));process.exit(1)}}
if(isCoordinateLocation('95, 123')||!isCoordinateLocation('9.65, 123.98')) process.exit(2);
'''
    result = subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,capture_output=True,text=True)
    assert result.returncode==0,result.stderr + result.stdout


def test_admin_dashboard_labels_raw_coordinate_and_avoids_risk_claims():
    source=(ROOT/'src/pages/AdminDashboard.jsx').read_text(encoding='utf-8')
    assert "from '../utils/locationLabel'" in source
    assert "Recorded Citations by Location" in source
    assert 'displayLocation(' in source
    assert 'currently has the highest recorded activity' in source
    assert 'Risk levels will populate' not in source

"""Regression checks for the adviser-aligned citation form and API boundary."""
import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP') or 'php'


def test_pricing_helpers_reject_missing_configuration_and_calculate_flat_totals():
    script = '''import {citationContextReady,citationTotal,citationDateTime} from './src/utils/citationForm.js';
const valid={flat_penalty:150,date_issued:'2026-09-30',time_issued:'21:45:00',appearance_due_date:'2026-10-07'};
console.log(JSON.stringify({valid:citationContextReady(valid),missing:citationContextReady(null),
zero:citationContextReady({...valid,flat_penalty:0}),wrong:citationContextReady({...valid,flat_penalty:999}),
two:citationTotal(2,valid),three:citationTotal(3,valid),unavailable:citationTotal(2,null),
empty:citationTotal(0,valid),time:citationDateTime(valid)}));'''
    result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT,
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['valid'] is True
    assert data['missing'] is False and data['zero'] is False and data['wrong'] is False
    assert data['two'] == 300 and data['three'] == 450
    assert data['unavailable'] is None and data['empty'] is None
    assert 'September 30, 2026' in data['time'] and '9:45' in data['time']


def test_catalog_load_is_independent_of_pricing_and_form_has_no_editable_time():
    page = (ROOT / 'src/pages/IssueTicket.jsx').read_text(encoding='utf-8')
    router = (ROOT / 'api/src/router.php').read_text(encoding='utf-8')
    handler = (ROOT / 'api/src/handlers/violations.php').read_text(encoding='utf-8')
    assert "#^/api/violations/active/?$#" in router
    assert "'status'=>'eq.active'" in handler
    assert handler.count("'is_citation_selectable'=>'eq.true'") == 2
    assert 'API.activeViolations().then' in page
    assert 'API.citationContext().then' in page
    assert 'Promise.all([API.activeViolations(), API.citationContext()])' not in page
    assert "catalogState === 'empty'" in page
    assert "catalogState === 'error'" in page
    assert 'Penalty unavailable' in page
    assert "total == null ? 'Unavailable' : money(total)" in page
    assert "field('ticket_number', 'TRAFFIC CITATION NO.'" in page
    assert "field('incident_date'" not in page and "field('incident_time'" not in page
    assert 'Specify Other Violation *' in page
    assert 'Use Current GPS' in page and 'violation_latitude: latitude' in page
    assert 'location:`${latitude' not in page


def test_php_boundary_accepts_manual_citation_and_validates_optional_gps_pair():
    handler = json.dumps(str(ROOT / 'api/src/handlers/tickets.php'))
    script = '''function fail(string $m,int $s=400,string $c='ERROR',array $x=[]):never{throw new RuntimeException($c);}
function text_length(string $v):int{return strlen($v);}
function normalize_plate($v):string{return strtoupper(trim((string)$v));}
function normalize_email($v):string{return strtolower(trim((string)$v));}
require HANDLER;
$base=['ticket_number'=>'7258','plate_number'=>'ABC1234','vehicle_type'=>'car','vehicle_make'=>'Test Make',
'owner_name'=>'Owner','owner_address'=>'Address','driver_first_name'=>'Test','driver_last_name'=>'Driver',
'driver_address'=>'Address','driver_nationality'=>'Filipino','driver_email'=>'driver@example.test',
'license_type'=>'Non-Professional','expected_date'=>'2026-09-30','violation_ids'=>[1,2],
'location'=>'Poblacion, Calape, Bohol'];
$plain=citation_input($base);
$gps=citation_input($base+['violation_latitude'=>0.0,'violation_longitude'=>123.9]);
$invalid=[];
foreach([['violation_latitude'=>9.8],['violation_latitude'=>91,'violation_longitude'=>123.9]] as $extra){
try{citation_input($base+$extra);$invalid[]=false;}catch(RuntimeException $e){$invalid[]=$e->getMessage()==='VALIDATION_ERROR';}}
echo json_encode(['ticket'=>$plain['ticket_number'],'ids'=>$plain['violation_ids'],
'noGps'=>$plain['violation_latitude']===null,'gps'=>$gps['violation_latitude']===0.0,'invalid'=>$invalid]);'''
    result = subprocess.run([str(PHP), '-r', script.replace('HANDLER', handler)], cwd=ROOT,
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data == {'ticket': '7258', 'ids': [1, 2], 'noGps': True,
                    'gps': True, 'invalid': [True, True]}

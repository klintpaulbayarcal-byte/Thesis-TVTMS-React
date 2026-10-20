"""Execute the real PHP handlers against an isolated in-memory API double."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP', 'php')


def mutation(action='update', changes=None, duplicate_race=False, official=False):
    payload = changes or {'description': 'QA metadata only'}
    script = r'''
class SupabaseException extends RuntimeException {public ?string $pgCode='23505';}
function require_role($roles){return ['id'=>1];}
function json_input(){return json_decode(INPUT,true);}
function clean_string($value,$max=4000){return substr(trim((string)$value),0,$max);}
function supabase_select($table,$filters,$options){
    if(isset($filters['violation_code']))return [];
    return [['id'=>6,'is_citation_selectable'=>OFFICIAL,'violation_code'=>'V006',
      'violation_name'=>'QA legacy entry','description'=>'Before','penalty_amount'=>OFFICIAL?150:5000,
      'demerit_points'=>5,'status'=>'active','requires_description'=>false]];
}
function supabase_rpc($name,$args=[]){return 150;}
function supabase_update($table,$data,$filters,$representation){$GLOBALS['saved']=$data;return [];}
function supabase_insert($table,$data){if(RACE)throw new SupabaseException('unique violation');$GLOBALS['saved']=$data[0];return [['id'=>99]];}
function log_audit(...$args){}
function fail($message,$status,$code){echo json_encode(['status'=>$status,'code'=>$code,'saved'=>$GLOBALS['saved']??null]);exit;}
function json_response($response,$status=200){echo json_encode(['status'=>$status,'saved'=>$GLOBALS['saved']??null]);exit;}
require HANDLER;
if(ACTION==='create')violations_create();else violations_update(['id'=>6]);
'''
    replacements = {
        'INPUT': json.dumps(json.dumps(payload)),
        'HANDLER': json.dumps(str(ROOT / 'api/src/handlers/violations.php')),
        'OFFICIAL': 'true' if official else 'false',
        'RACE': 'true' if duplicate_race else 'false',
        'ACTION': json.dumps(action),
    }
    for key, value in replacements.items():
        script = script.replace(key, value)
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, text=True,
                            capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_metadata_update_preserves_nonselectable_legacy_penalty():
    result = mutation()
    assert result['status'] == 200
    assert result['saved']['description'] == 'QA metadata only'
    assert result['saved']['penalty_amount'] == 5000


def test_official_metadata_and_new_admin_entries_keep_the_flat_penalty():
    assert mutation(official=True)['saved']['penalty_amount'] == 150
    result = mutation('create', {'violation_code': 'QA-ONLY', 'violation_name': 'QA reference'})
    assert result['status'] == 201
    assert result['saved']['penalty_amount'] == 150


@pytest.mark.parametrize('points', [1.5, '2.7', True, [], 101, -1])
@pytest.mark.parametrize('action', ['create', 'update'])
def test_invalid_demerit_points_are_rejected_before_mutation(points, action):
    result = mutation(action, {'violation_code': 'QA-ONLY', 'violation_name': 'QA reference',
                               'demerit_points': points})
    assert result['status'] == 400
    assert result['code'] == 'VALIDATION_ERROR'
    assert result['saved'] is None


def test_duplicate_code_race_returns_conflict_without_a_false_success():
    result = mutation('create', {'violation_code': 'QA-ONLY', 'violation_name': 'QA reference'},
                      duplicate_race=True)
    assert result == {'status': 409, 'code': 'DUPLICATE_CODE', 'saved': None}

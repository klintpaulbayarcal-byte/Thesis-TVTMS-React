"""Ticket preview and vehicle lookup must reject out-of-order responses."""
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_generation_gate_rejects_out_of_order_responses():
    js='''import {createRequestGate} from './src/utils/requestGate.js';
const g=createRequestGate();
const first=g.begin(), second=g.begin();
if(g.isCurrent(first)||!g.isCurrent(second))process.exit(1);
g.invalidate();if(g.isCurrent(second))process.exit(2);
const third=g.begin();if(!g.isCurrent(third))process.exit(3);
'''
    result=subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,capture_output=True,text=True)
    assert result.returncode==0,result.stderr


def test_issue_form_invalidates_stale_responses_on_every_input_reset():
    src=(ROOT/'src/pages/IssueTicket.jsx').read_text(encoding='utf-8')
    assert "import { createRequestGate } from '../utils/requestGate'" in src
    assert 'previewGate.current.invalidate()' in src
    assert 'lookupGate.current.invalidate()' in src
    assert 'previewGate.current.isCurrent(token)' in src
    assert 'lookupGate.current.isCurrent(token)' in src
    assert 'const plateChanged=event=>' in src
    assert 'Same-Plate/Same-Violation Penalty Level: {sameViolationLevel}' in src
    assert 'setPreview(null)' in src

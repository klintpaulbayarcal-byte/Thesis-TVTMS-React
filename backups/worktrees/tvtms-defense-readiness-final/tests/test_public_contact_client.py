"""Exercise the public contact API client without network or credentials."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_contact_client_reports_email_delivery_failure_without_resubmitting():
    script = r'''
import { API, ApiError } from './src/services/api.js';
let sent = 0;
globalThis.localStorage = { getItem: () => null };
globalThis.fetch = async () => {
  sent++;
  return {
    ok: true, status: 201,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, contact_id: 41,
      message: 'Your message was saved. One or more emails could not be confirmed; please do not resubmit the same message.',
      email_status: { administrator: 'failed', confirmation: 'accepted' } }),
  };
};
try {
  await API.publicContact({ fullName: 'QA', email: 'qa@example.invalid', subject: 'QA', message: 'QA message body' });
  console.log(JSON.stringify({ caught: false, sent }));
} catch (error) {
  console.log(JSON.stringify({ caught: true, sent, errorCode: error.code,
    message: error.message, contact_id: error.payload?.contact_id,
    isApiError: error instanceof ApiError }));
}
'''
    output = subprocess.run(['node', '--input-type=module', '-e', script],
                            cwd=ROOT, capture_output=True, text=True, timeout=8)
    assert output.returncode == 0, output.stderr
    result = json.loads(output.stdout)
    assert result['caught'] is True
    assert result['sent'] == 1
    assert result['errorCode'] == 'CONTACT_SAVED_EMAIL_INCOMPLETE'
    assert result['contact_id'] == 41
    assert result['isApiError'] is True
    assert 'saved' in result['message'].lower()

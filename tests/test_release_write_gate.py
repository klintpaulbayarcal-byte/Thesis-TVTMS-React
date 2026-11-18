"""Execute the Apache release rules locally, never on Hostinger."""
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_apache_release_gate_blocks_normal_writes_and_allows_only_operator(tmp_path):
    executable = os.environ.get('TVTMS_APACHE') or 'C:/xampp/apache/bin/httpd.exe'
    if not Path(executable).exists():
        pytest.skip('Optional local Apache runtime unavailable; local Windows release evidence required')
    apache_root = Path(executable).resolve().parents[1]
    web = tmp_path / 'web'
    api = web / 'api'
    api.mkdir(parents=True)
    (api / 'index.html').write_text('local fixture')
    shutil.copyfile(ROOT / 'api/.htaccess', api / '.htaccess')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    config = tmp_path / 'httpd.conf'
    modules = ['authz_core', 'rewrite', 'dir', 'mime']
    config.write_text(f'ServerRoot "{apache_root.as_posix()}"\n'
                     + ''.join(f'LoadModule {name}_module modules/mod_{name}.so\n' for name in modules)
                     + f'Listen 127.0.0.1:{port}\nServerName localhost\n'
                     + f'PidFile "{(tmp_path / "httpd.pid").as_posix()}"\n'
                     + f'DefaultRuntimeDir "{tmp_path.as_posix()}"\n'
                     + f'ScoreBoardFile "{(tmp_path / "scoreboard").as_posix()}"\n'
                     + f'ErrorLog "{(tmp_path / "error.log").as_posix()}"\n'
                     + 'TypesConfig conf/mime.types\nDirectoryIndex index.html\n'
                     + '<Directory />\nAllowOverride None\nRequire all denied\n</Directory>\n'
                     + f'DocumentRoot "{web.as_posix()}"\n<Directory "{web.as_posix()}">\n'
                     + 'AllowOverride All\nRequire all granted\n</Directory>\n')
    with (tmp_path / 'process.log').open('w') as log:
        process = subprocess.Popen([executable, '-f', str(config), '-X'], stdin=subprocess.DEVNULL,
                                   stdout=log, stderr=log)
        try:
            def request(method='GET', cookie=None, path='/api/index.html'):
                req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method,
                                             headers={'Cookie': cookie} if cookie else {})
                try:
                    with urllib.request.urlopen(req, timeout=5) as response:
                        return response.status
                except urllib.error.HTTPError as error:
                    return error.code
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                try:
                    assert request() == 200
                    break
                except (urllib.error.URLError, TimeoutError):
                    time.sleep(0.1)
            else:
                pytest.fail('Local Apache did not start')
            unlocked = {method: request(method) for method in ['POST', 'PUT', 'DELETE', 'PATCH']}
            lock = api / '.release-write-lock'
            lock.touch()
            assert request() == 200
            for method in unlocked:
                assert request(method) == 503
                assert request(method, 'tvtms_release=invalid') == 503
                assert request(method, 'tvtms_release=' + secrets.token_hex(32)) == 503
            token = secrets.token_hex(32)
            marker = api / ('.release-operator-' + token)
            marker.touch()
            for method, status in unlocked.items():
                assert request(method, 'other=fixture; tvtms_release=' + token + '; extra=fixture') == status
            assert request(path='/api/.release-write-lock') == 403
            assert request(path='/api/' + marker.name) == 403
            lock.unlink()
            for method, status in unlocked.items():
                assert request(method) == status
        finally:
            process.terminate()
            process.wait(timeout=10)

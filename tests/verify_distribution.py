from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

def test_hostinger_docs_exist():
    assert (ROOT/'HOSTINGER_REACT_SUPABASE_DEPLOYMENT.md').is_file()
    assert (ROOT/'REACT_MIGRATION_CHANGES.md').is_file()

def test_supabase_schema_and_migrations_exist():
    assert (ROOT/'supabase/schema/database.postgres.sql').is_file()
    migrations=list((ROOT/'supabase/migrations').glob('*.sql'))
    assert len(migrations)>=5

def test_apache_spa_rules_exclude_api_and_uploads():
    t=(ROOT/'.htaccess').read_text(encoding='utf-8')
    assert 'api' in t.lower() and 'uploads' in t.lower()
    assert 'index.html' in t

def test_no_real_secrets_in_deployable_text_files():
    suspect=[]
    pat=re.compile(r'(sb_secret_[A-Za-z0-9_-]{10,}|service_role.{0,80}eyJ|SUPABASE_SECRET_KEY\s*=\s*[^\s<][^\n]*)', re.I)
    for p in ROOT.rglob('*'):
        if not p.is_file() or any(part in {'node_modules','.git','dist'} for part in p.parts):
            continue
        if p.name == 'config.local.php':
            continue
        if p.suffix.lower() in {'.php','.js','.jsx','.json','.md','.txt','.sql','.example','.env'} or p.name.endswith('.example.php'):
            text=p.read_text(encoding='utf-8', errors='ignore')
            for m in pat.finditer(text):
                s=m.group(0)
                if 'your-' in s.lower() or 'change_me' in s.lower() or 'example' in s.lower():
                    continue
                suspect.append((str(p.relative_to(ROOT)), s[:80]))
    assert not suspect, suspect[:10]

def test_hostinger_packager_is_defined_and_keeps_server_files_separate_from_react_build():
    p=ROOT/'scripts/package-hostinger.cjs'
    assert p.is_file()
    t=p.read_text(encoding='utf-8')
    assert "'dist'" in t or '"dist"' in t
    assert "'api'" in t or '"api"' in t
    assert "'uploads'" in t or '"uploads"' in t
    assert '.htaccess' in t
    package=(ROOT/'package.json').read_text(encoding='utf-8')
    assert 'build:hostinger' in package

def test_hostinger_packager_rejects_accidentally_packaged_server_secrets():
    t=(ROOT/'scripts/package-hostinger.cjs').read_text(encoding='utf-8')
    assert 'sb_secret_' in t, 'packager should scan the assembled deploy folder for Supabase secret keys'
    assert 'config.local.php' in t, 'packager must explicitly exclude local secret config'
    assert 'process.exit(1)' in t, 'packager must fail closed when a secret is detected'

def test_deployment_docs_use_local_secret_override_without_overwriting_runtime_config():
    doc=(ROOT/'HOSTINGER_REACT_SUPABASE_DEPLOYMENT.md').read_text(encoding='utf-8')
    readme=(ROOT/'README_FIRST.txt').read_text(encoding='utf-8')
    assert 'config.local.example.php' in doc
    assert 'config.local.php' in doc
    assert 'Copy `api/config/config.example.php` to `api/config/config.php`' not in doc
    assert 'deploy/api/config/config.local.php' in doc
    assert 'deploy/api/config/config.local.php' in readme

def test_jsx_verifier_is_portable_and_typescript_is_declared():
    import json
    script=(ROOT/'scripts/verify-jsx.cjs').read_text(encoding='utf-8')
    package=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    assert '/opt/nvm/' not in script
    assert "require('typescript')" in script or 'require("typescript")' in script
    assert 'typescript' in package.get('devDependencies', {})

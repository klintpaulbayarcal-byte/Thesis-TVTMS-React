import json
import os
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))
RENDERER = ROOT / "scripts/render-production-config.php"


def production_env(**overrides):
    values = {
        "SUPABASE_SECRET_KEY": "fixture-supabase-server-key",
        "TVTMS_TOKEN_SECRET": "t" * 40,
        "SMTP_HOST": "smtp.example.test",
        "SMTP_PORT": "587",
        "SMTP_SECURE": "tls",
        "SMTP_USERNAME": "mailer@example.test",
        "SMTP_PASSWORD": "fixture-password-123",
        "SMTP_FROM_EMAIL": "noreply@example.test",
        "SMTP_FROM_NAME": "TVTMS Test",
    }
    values.update(overrides)
    env = os.environ.copy()
    env.update(values)
    return env, values


def run_renderer(tmp_path, **overrides):
    target = tmp_path / "api/config/config.local.php"
    target.parent.mkdir(parents=True)
    env, values = production_env(**overrides)
    result = subprocess.run(
        [str(PHP), str(RENDERER), str(target)],
        cwd=ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    return result, target, values


def test_renderer_writes_complete_private_config_without_printing_secrets(tmp_path):
    result, target, values = run_renderer(tmp_path)
    assert result.returncode == 0, result.stderr
    assert target.is_file()
    combined = result.stdout + result.stderr
    for secret in [values["SUPABASE_SECRET_KEY"], values["TVTMS_TOKEN_SECRET"], values["SMTP_PASSWORD"]]:
        assert secret not in combined
    load = subprocess.run(
        [str(PHP), "-r", "$x=require $argv[1];echo json_encode($x);", str(target)],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert load.returncode == 0, load.stderr
    config = json.loads(load.stdout)
    assert config["supabase_secret_key"] == values["SUPABASE_SECRET_KEY"]
    assert config["token_secret"] == values["TVTMS_TOKEN_SECRET"]
    assert config["development"] is False
    assert config["smtp"] == {
        "enabled": True,
        "host": values["SMTP_HOST"],
        "port": 587,
        "secure": "tls",
        "username": values["SMTP_USERNAME"],
        "password": values["SMTP_PASSWORD"],
        "from_email": values["SMTP_FROM_EMAIL"],
        "from_name": values["SMTP_FROM_NAME"],
    }


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"SMTP_PASSWORD": ""}, "SMTP_PASSWORD"),
        ({"SMTP_PORT": "70000"}, "SMTP_PORT"),
        ({"SMTP_SECURE": "none"}, "SMTP_SECURE"),
        ({"SMTP_FROM_EMAIL": "not-an-email"}, "SMTP_FROM_EMAIL"),
        ({"TVTMS_TOKEN_SECRET": "too-short"}, "TVTMS_TOKEN_SECRET"),
    ],
)
def test_renderer_fails_closed_and_leaves_no_target(tmp_path, overrides, field):
    result, target, values = run_renderer(tmp_path, **overrides)
    assert result.returncode != 0
    assert not target.exists()
    assert not list(target.parent.glob("config.local.php.tmp.*"))
    assert field in result.stderr
    combined = result.stdout + result.stderr
    for secret_name in ["SUPABASE_SECRET_KEY", "TVTMS_TOKEN_SECRET", "SMTP_PASSWORD"]:
        secret = values[secret_name]
        if secret:
            assert secret not in combined


def test_workflow_requires_all_smtp_secrets_and_uses_renderer():
    workflow = (ROOT / ".github/workflows/deploy-hostinger-v4.yml").read_text(encoding="utf-8")
    secret_names = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME"]
    for name in secret_names:
        assert f"{name}: ${{{{ secrets.{name} }}}}" in workflow
        assert f'test -n "${name}"' in workflow
        assert f'echo "${name}"' not in workflow
    assert "php scripts/render-production-config.php deploy/api/config/config.local.php" in workflow
    assert "'enabled' => false" not in workflow
    assert "mirror -R" in workflow
    assert "mirror -R --delete" not in workflow
    assert "rm -f /pages/landing.html" in workflow


def test_health_uses_complete_smtp_configuration_status():
    source = (ROOT / "api/index.php").read_text(encoding="utf-8")
    assert "smtp_configuration_status(app_config()['smtp']??[])==='configured'" in source
    assert "!empty(app_config()['smtp']['enabled'])" not in source

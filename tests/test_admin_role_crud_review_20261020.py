from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_admin_crud_role_guards():
    src=(ROOT/'api/src/handlers/tickets.php').read_text()
    assert "function tickets_create(array $params=[]): never\n{\n    $u=require_role(['apprehending_officer'])" in src
    assert "function tickets_cancel(array $params): never\n{\n    $u=require_role(['admin'])" in src
    assert "function tickets_permanent_delete(array $params): never\n{\n    $u=require_role(['admin'])" in src
    assert "TICKET_DELETE_AUTHORIZED" in src

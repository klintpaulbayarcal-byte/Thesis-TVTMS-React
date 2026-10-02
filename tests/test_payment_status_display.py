"""Ticket payment display must use derived payment state, not ticket lifecycle."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_ticket_table_displays_derived_payment_status():
    source = (ROOT / 'src/pages/Payments.jsx').read_text(encoding='utf-8')
    assert "label:'Status',render:row=><StatusBadge value={row.payment_status??row.status}/>" in source
    assert "API.recordPayment({ticket_id:selected.id,...form,amount_paid:Number(form.amount_paid)})" in source
    assert "Number(selected.remaining_balance||0)>0" in source

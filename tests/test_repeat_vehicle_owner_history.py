from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_vehicle_owner_link_reused_without_cross_vehicle_name_merging():
    sql=(ROOT/'supabase/migrations/202610220001_repeat_vehicle_owner_linkage.sql').read_text()
    assert "create or replace function public.tvtms_ticket_create" in sql
    assert "vehicle.owner_id is not null" in sql
    assert "where id=vehicle.owner_id" in sql
    assert "lower(btrim(coalesce(name,'')))=lower(btrim(p_data->>'owner_name'))" in sql
    assert "lower(btrim(coalesce(address,'')))=lower(btrim(p_data->>'owner_address'))" in sql
    assert "insert into public.owners(name,address)" in sql
    assert "update public.vehicles set owner_id=vehicle.owner_id" in sql
    assert "where replace(replace(upper(plate_number),'-',''),' ','')=plate" in sql
    assert "insert into public.tickets" in sql
    assert "insert into public.ticket_violations" in sql

def test_staff_plate_lookup_separates_citations_and_violation_items():
    ui=(ROOT/'src/pages/LicensePlateLookup.jsx').read_text()
    assert 'Historical Citations' in ui
    assert 'Individual Violations' in ui
    assert "stats?.historical_ticket_count" in ui
    assert 'violations.reduce((sum,item)' in ui
